const { MercadoPagoConfig, Preference, Payment } = require('mercadopago');
const { validarExtrasNoDobleYTriple, construirPersonalizaciones } = require('./PersonalizacionesService');
const { parseScheduledTime } = require('./ScheduledTimeParser');
const {
    obtenerUrlsBaseCheckoutProNormalizadas,
    assertUrlHttpsPublicaMercadoPago,
    MERCADO_PAGO_CHECKOUT_PUBLIC_URL_ERROR_MESSAGE
} = require('./mercadoPagoPreferenciaUrlHelper');
const { calcularTotalesDesdePrecioFinal } = require('./totalesPrecioFinal');

const PROVEEDOR_MERCADOPAGO = 'MERCADOPAGO';
const MONEDA_ARS = 'ARS';
const ESTADO_PAGO_PENDIENTE = 'PENDIENTE';
const ESTADO_PAGO_PAGADO = 'PAGADO';
const ESTADO_PAGO_RECHAZADO = 'RECHAZADO';
const ESTADO_PAGO_CANCELADO = 'CANCELADO';

function getMercadoPagoClient() {
    const accessToken = process.env.MP_ACCESS_TOKEN;
    if (!accessToken) {
        throw new Error('MP_ACCESS_TOKEN no está configurado');
    }
    return new MercadoPagoConfig({ accessToken });
}

function validarPayloadCheckout(payload) {
    if (!payload || typeof payload !== 'object') {
        throw new Error('Payload inválido');
    }
}

function normalizarExtrasIds(extras = []) {
    const ids = extras
        .map((extra) => Number(extra?.id))
        .filter((id) => Number.isInteger(id) && id > 0);
    return [...new Set(ids)];
}

async function obtenerArticulosPorIds(connection, articuloIds = []) {
    if (articuloIds.length === 0) return [];
    const placeholders = articuloIds.map(() => '?').join(',');
    const [rows] = await connection.execute(
        `SELECT id, nombre, precio, controla_stock
         FROM articulos
         WHERE id IN (${placeholders}) AND activo = 1`,
        articuloIds
    );
    return rows;
}

async function obtenerExtrasValidos(connection, articuloId, extrasIds = []) {
    if (extrasIds.length === 0) return [];
    const placeholders = extrasIds.map(() => '?').join(',');
    const [rows] = await connection.execute(
        `SELECT a.id, a.nombre, a.precio_extra
         FROM adicionales a
         INNER JOIN adicionales_contenido ac
           ON ac.adicional_id = a.id
          AND ac.articulo_id = ?
         WHERE a.disponible = 1
           AND a.id IN (${placeholders})`,
        [articuloId, ...extrasIds]
    );
    return rows;
}

async function recalcularCarrito(connection, items = []) {
    const articuloIds = [...new Set(items.map((item) => Number(item.articulo_id)))];
    const articulosRows = await obtenerArticulosPorIds(connection, articuloIds);
    const articulosMap = new Map(articulosRows.map((articulo) => [Number(articulo.id), articulo]));

    const itemsNormalizados = [];

    for (const item of items) {
        const articuloId = Number(item.articulo_id);
        const cantidad = Number(item.cantidad);
        const articulo = articulosMap.get(articuloId);

        if (!articulo) {
            throw new Error(`Artículo no encontrado o inactivo: ${articuloId}`);
        }

        const extrasIds = normalizarExtrasIds(item.extras);
        const extrasRows = await obtenerExtrasValidos(connection, articuloId, extrasIds);

        if (extrasRows.length !== extrasIds.length) {
            throw new Error(`Uno o más extras no son válidos para el artículo ${articulo.nombre}`);
        }

        const extrasSnapshot = extrasRows.map((extra) => ({
            id: Number(extra.id),
            nombre: extra.nombre,
            precio_extra: Number(extra.precio_extra) || 0
        }));

        const validacionExtras = validarExtrasNoDobleYTriple(extrasSnapshot);
        if (!validacionExtras.valid) {
            throw new Error(validacionExtras.message);
        }

        const precioBase = Number(articulo.precio) || 0;
        const totalExtras = extrasSnapshot.reduce((sum, extra) => sum + extra.precio_extra, 0);
        const precioUnitario = precioBase + totalExtras;
        const subtotal = precioUnitario * cantidad;

        itemsNormalizados.push({
            articulo_id: articuloId,
            articulo_nombre: articulo.nombre,
            cantidad,
            precio_unitario: precioUnitario,
            subtotal,
            observaciones: item.observaciones || null,
            personalizaciones: extrasSnapshot.length > 0
                ? construirPersonalizaciones(extrasSnapshot)
                : null
        });
    }

    const totalBase = itemsNormalizados.reduce((sum, item) => sum + item.subtotal, 0);
    const { subtotal, iva_total, total } = calcularTotalesDesdePrecioFinal(totalBase);

    return {
        itemsNormalizados,
        subtotal,
        iva_total,
        total
    };
}

function normalizarHorarioEntrega(horarioEntregaRaw) {
    if (!horarioEntregaRaw) return null;
    const parsed = parseScheduledTime(String(horarioEntregaRaw));
    if (parsed.error) {
        throw new Error(`horario_entrega inválido: ${parsed.error}`);
    }
    return parsed.date;
}

async function insertarPedido(connection, payload, resumenCarrito) {
    const horarioEntregaDate = normalizarHorarioEntrega(payload?.pedido?.horario_entrega);
    const query = `
        INSERT INTO pedidos (
            fecha, cliente_nombre, cliente_direccion, cliente_telefono, cliente_email,
            origen_pedido, subtotal, iva_total, total, medio_pago, estado_pago, modalidad, horario_entrega,
            estado, observaciones, monto_con_cuanto_abona, usuario_id, usuario_nombre,
            prioridad, tiempo_estimado_preparacion, hora_inicio_preparacion, transicion_automatica
        ) VALUES (
            NOW(), ?, ?, ?, ?, 'WEB', ?, ?, ?, ?, ?, ?, ?,
            'RECIBIDO', ?, NULL, NULL, NULL, ?, 15, NULL, TRUE
        )
    `;

    const values = [
        payload.cliente.nombre,
        payload.cliente.direccion || null,
        payload.cliente.telefono,
        payload.cliente.email || null,
        resumenCarrito.subtotal,
        resumenCarrito.iva_total,
        resumenCarrito.total,
        PROVEEDOR_MERCADOPAGO,
        ESTADO_PAGO_PENDIENTE,
        payload.pedido.modalidad,
        horarioEntregaDate,
        payload.pedido.observaciones || null,
        payload.pedido.prioridad || 'ALTA'
    ];

    const [result] = await connection.execute(query, values);
    return result.insertId;
}

async function insertarPedidoContenido(connection, pedidoId, itemsNormalizados = []) {
    const query = `
        INSERT INTO pedidos_contenido (
            pedido_id, articulo_id, articulo_nombre, cantidad, precio, subtotal,
            personalizaciones, observaciones
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `;

    for (const item of itemsNormalizados) {
        await connection.execute(query, [
            pedidoId,
            item.articulo_id,
            item.articulo_nombre,
            item.cantidad,
            item.precio_unitario,
            item.subtotal,
            item.personalizaciones ? JSON.stringify(item.personalizaciones) : null,
            item.observaciones
        ]);

        await connection.execute(
            'UPDATE articulos SET stock_actual = stock_actual - ? WHERE id = ? AND controla_stock = 1',
            [item.cantidad, item.articulo_id]
        );
    }
}

async function insertarPedidoPago(connection, pedidoId, total) {
    const referenciaExterna = `pedido_${pedidoId}`;
    const query = `
        INSERT INTO pedidos_pagos (
            pedido_id, fecha, proveedor_pago, estado_pago, monto, moneda,
            referencia_externa, id_preferencia, id_pago, estado_proveedor,
            detalle_estado_proveedor, fecha_aprobado, fecha_ultima_notificacion,
            datos_adicionales, fecha_modificacion
        ) VALUES (?, NOW(), ?, ?, ?, ?, ?, NULL, NULL, ?, ?, NULL, NOW(), ?, NOW())
    `;
    const values = [
        pedidoId,
        PROVEEDOR_MERCADOPAGO,
        ESTADO_PAGO_PENDIENTE,
        total,
        MONEDA_ARS,
        referenciaExterna,
        'preference_pending',
        'Pedido creado pendiente de preferencia',
        JSON.stringify({})
    ];
    const [result] = await connection.execute(query, values);
    return {
        pagoId: result.insertId,
        referenciaExterna
    };
}

function construirDescripcionPreferencia(itemsNormalizados = []) {
    const chunks = itemsNormalizados.map((item) => `${item.cantidad}x ${item.articulo_nombre}`);
    const resumen = chunks.join(', ');
    if (resumen.length <= 240) return resumen;
    return `${resumen.slice(0, 237)}...`;
}

function assertBackUrlsValidas(backUrls) {
    if (!backUrls || typeof backUrls !== 'object') {
        throw new Error('Payload inválido para Mercado Pago: back_urls no está definido');
    }

    const campos = ['success', 'pending', 'failure'];
    for (const campo of campos) {
        const valor = String(backUrls[campo] || '').trim();
        if (!valor) {
            throw new Error(`Payload inválido para Mercado Pago: back_urls.${campo} es obligatorio`);
        }
        try {
            assertUrlHttpsPublicaMercadoPago(valor, `back_urls.${campo}`);
        } catch (e) {
            throw new Error(e.message || MERCADO_PAGO_CHECKOUT_PUBLIC_URL_ERROR_MESSAGE);
        }
    }
}

function construirPreferenciaPayload({ pedidoId, total, modalidad, referenciaExterna, itemsNormalizados }) {
    const { cartaFrontendBaseUrl: frontendBaseUrl, backendBaseUrl } = obtenerUrlsBaseCheckoutProNormalizadas();

    const descripcion = construirDescripcionPreferencia(itemsNormalizados);
    const baseResultUrl = `${frontendBaseUrl}/checkout/resultado?pedido_id=${pedidoId}`;
    const backUrls = {
        success: `${baseResultUrl}&resultado=success`,
        pending: `${baseResultUrl}&resultado=pending`,
        failure: `${baseResultUrl}&resultado=failure`
    };

    assertBackUrlsValidas(backUrls);

    const payload = {
        items: [
            {
                id: `pedido_${pedidoId}`,
                title: `Pedido El Chalito #${pedidoId}`,
                description: descripcion,
                quantity: 1,
                currency_id: MONEDA_ARS,
                unit_price: Number(total)
            }
        ],
        external_reference: referenciaExterna,
        back_urls: backUrls,
        notification_url: `${backendBaseUrl}/api/carta-publica/checkout/mercadopago/webhook`,
        metadata: {
            pedido_id: pedidoId,
            origen: 'WEB',
            modulo: 'chalito_carta',
            modalidad,
            proveedor_pago: PROVEEDOR_MERCADOPAGO
        }
    };

    // Mercado Pago requiere back_urls.success para usar auto_return.
    if (payload.back_urls?.success) {
        payload.auto_return = 'approved';
    }

    return payload;
}

async function crearPreferenciaMercadoPago(preferenciaPayload) {
    const cartUrl = String(process.env.CARTA_FRONTEND_URL || '').trim();
    const backUrl = String(process.env.BACKEND_URL || '').trim();
    const backUrls = preferenciaPayload?.back_urls || {};
    const notificationUrl = preferenciaPayload?.notification_url || null;

    obtenerUrlsBaseCheckoutProNormalizadas();

    assertBackUrlsValidas(backUrls);
    if (!notificationUrl) {
        throw new Error(`Payload inválido para Mercado Pago: notification_url es obligatorio. ${MERCADO_PAGO_CHECKOUT_PUBLIC_URL_ERROR_MESSAGE}`);
    }
    assertUrlHttpsPublicaMercadoPago(notificationUrl, 'notification_url');

    // Logs temporales de diagnóstico para validar payload real enviado a Mercado Pago.
    console.log('[MP][CheckoutPro][debug] CARTA_FRONTEND_URL:', cartUrl);
    console.log('[MP][CheckoutPro][debug] BACKEND_URL:', backUrl);
    console.log('[MP][CheckoutPro][debug] preferenceBody.back_urls:', JSON.stringify(backUrls, null, 2));
    console.log('[MP][CheckoutPro][debug] preferenceBody.notification_url:', notificationUrl);
    console.log('[MP][CheckoutPro][debug] preferenceBody completo:', JSON.stringify(preferenciaPayload, null, 2));

    const client = getMercadoPagoClient();
    const preference = new Preference(client);
    return preference.create({ body: preferenciaPayload });
}

async function actualizarIdPreferencia(executor, pagoId, idPreferencia, urlPago) {
    await executor.execute(
        `UPDATE pedidos_pagos
         SET id_preferencia = ?,
             estado_proveedor = ?,
             detalle_estado_proveedor = ?,
             datos_adicionales = ?,
             fecha_modificacion = NOW()
         WHERE id = ?`,
        [
            idPreferencia,
            'preference_created',
            'Preferencia creada correctamente',
            JSON.stringify({ init_point: urlPago || null }),
            pagoId
        ]
    );
}

async function crearCheckoutMercadoPago(db, payload) {
    validarPayloadCheckout(payload);

    const connection = await db.getConnection();
    let pedidoId = null;
    let pagoId = null;
    let referenciaExterna = null;
    let total = 0;
    let resumenCarrito = null;

    try {
        await connection.beginTransaction();
        resumenCarrito = await recalcularCarrito(connection, payload.items);
        total = resumenCarrito.total;

        pedidoId = await insertarPedido(connection, payload, resumenCarrito);
        await insertarPedidoContenido(connection, pedidoId, resumenCarrito.itemsNormalizados);
        const pagoInsert = await insertarPedidoPago(connection, pedidoId, total);
        pagoId = pagoInsert.pagoId;
        referenciaExterna = pagoInsert.referenciaExterna;

        await connection.commit();
    } catch (error) {
        try { await connection.rollback(); } catch (_) { /* noop */ }
        throw error;
    } finally {
        connection.release();
    }

    try {
        const preferenciaPayload = construirPreferenciaPayload({
            pedidoId,
            total,
            modalidad: payload.pedido.modalidad,
            referenciaExterna,
            itemsNormalizados: resumenCarrito.itemsNormalizados
        });
        const preferencia = await crearPreferenciaMercadoPago(preferenciaPayload);

        const idPreferencia = preferencia?.id;
        const urlPago = preferencia?.init_point || preferencia?.sandbox_init_point || null;
        if (!idPreferencia || !urlPago) {
            throw new Error('Mercado Pago no devolvió id de preferencia o URL de pago');
        }

        await actualizarIdPreferencia(db, pagoId, idPreferencia, urlPago);

        return {
            ok: true,
            data: {
                pedido_id: pedidoId,
                pago_id: pagoId,
                estado_pedido: 'RECIBIDO',
                estado_pago: ESTADO_PAGO_PENDIENTE,
                medio_pago: PROVEEDOR_MERCADOPAGO,
                total,
                moneda: MONEDA_ARS,
                referencia_externa: referenciaExterna,
                id_preferencia: idPreferencia,
                url_pago: urlPago
            }
        };
    } catch (error) {
        return {
            ok: false,
            error,
            data: {
                pedido_id: pedidoId,
                pago_id: pagoId,
                estado_pedido: 'RECIBIDO',
                estado_pago: ESTADO_PAGO_PENDIENTE,
                medio_pago: PROVEEDOR_MERCADOPAGO,
                total,
                moneda: MONEDA_ARS,
                referencia_externa: referenciaExterna
            }
        };
    }
}

function extraerPedidoIdDesdeReferencia(referenciaExterna) {
    if (!referenciaExterna) return null;
    const match = String(referenciaExterna).trim().match(/^pedido_(\d+)$/i);
    if (!match) return null;
    const pedidoId = Number(match[1]);
    return Number.isInteger(pedidoId) && pedidoId > 0 ? pedidoId : null;
}

function mapearEstadoMercadoPago(status) {
    const normalized = String(status || '').trim().toLowerCase();
    switch (normalized) {
    case 'approved':
        return ESTADO_PAGO_PAGADO;
    case 'pending':
    case 'in_process':
        return ESTADO_PAGO_PENDIENTE;
    case 'rejected':
        return ESTADO_PAGO_RECHAZADO;
    case 'cancelled':
        return ESTADO_PAGO_CANCELADO;
    default:
        return ESTADO_PAGO_PENDIENTE;
    }
}

function construirResumenPagoMp(pagoMp = {}) {
    return {
        id: pagoMp?.id ? String(pagoMp.id) : null,
        status: pagoMp?.status || null,
        status_detail: pagoMp?.status_detail || null,
        external_reference: pagoMp?.external_reference || null,
        transaction_amount: pagoMp?.transaction_amount ?? null,
        date_approved: pagoMp?.date_approved || null,
        metadata: pagoMp?.metadata || {}
    };
}

function extraerNotificacionMercadoPago(req) {
    const bodyType = req.body?.type || req.body?.topic;
    const queryType = req.query?.type || req.query?.topic;
    const type = bodyType || queryType || null;
    const bodyId = req.body?.data?.id || req.body?.id;
    const queryId = req.query?.id || req.query?.['data.id'];
    const paymentId = bodyId || queryId || null;
    return {
        type: String(type || '').toLowerCase(),
        paymentId: paymentId ? String(paymentId) : null
    };
}

async function obtenerPagoMercadoPago(paymentId) {
    const client = getMercadoPagoClient();
    const paymentClient = new Payment(client);
    return paymentClient.get({ id: paymentId });
}

async function procesarWebhookMercadoPago(db, req) {
    const { type, paymentId } = extraerNotificacionMercadoPago(req);
    if (!type || type !== 'payment' || !paymentId) {
        return { procesado: false, motivo: 'notificacion_ignorada' };
    }

    const pago = await obtenerPagoMercadoPago(paymentId);
    const resumenPagoMp = construirResumenPagoMp(pago);
    const externalReference = resumenPagoMp.external_reference;
    if (!externalReference) {
        return { procesado: false, motivo: 'sin_referencia_externa', paymentId };
    }

    const estadoProveedor = resumenPagoMp.status;
    const detalleEstadoProveedor = resumenPagoMp.status_detail;
    const estadoPagoInterno = mapearEstadoMercadoPago(estadoProveedor);
    const fechaAprobadoParseada = resumenPagoMp.date_approved ? new Date(resumenPagoMp.date_approved) : null;
    const fechaAprobadoValida = fechaAprobadoParseada && !Number.isNaN(fechaAprobadoParseada.getTime())
        ? fechaAprobadoParseada
        : null;
    const fechaAprobado = estadoPagoInterno === ESTADO_PAGO_PAGADO
        ? (fechaAprobadoValida || new Date())
        : null;

    const pedidoIdDesdeMetadata = Number(resumenPagoMp?.metadata?.pedido_id) || null;
    const pedidoIdDesdeReferencia = extraerPedidoIdDesdeReferencia(externalReference);
    let pedidoId = pedidoIdDesdeMetadata || pedidoIdDesdeReferencia;

    if (!pedidoId) {
        const [pagosRows] = await db.execute(
            `SELECT pedido_id
             FROM pedidos_pagos
             WHERE referencia_externa = ?
             LIMIT 1`,
            [externalReference]
        );
        pedidoId = pagosRows.length > 0 ? Number(pagosRows[0].pedido_id) : null;
    }

    await db.execute(
        `UPDATE pedidos_pagos
         SET id_pago = ?,
             estado_pago = ?,
             estado_proveedor = ?,
             detalle_estado_proveedor = ?,
             fecha_aprobado = ?,
             fecha_ultima_notificacion = NOW(),
             datos_adicionales = ?,
             fecha_modificacion = NOW()
         WHERE referencia_externa = ?`,
        [
            String(paymentId),
            estadoPagoInterno,
            estadoProveedor,
            detalleEstadoProveedor,
            fechaAprobado,
            JSON.stringify(resumenPagoMp),
            externalReference
        ]
    );

    if (pedidoId) {
        await db.execute(
            `UPDATE pedidos
             SET estado_pago = ?,
                 fecha_modificacion = NOW()
             WHERE id = ?`,
            [estadoPagoInterno, pedidoId]
        );
    }

    return {
        procesado: true,
        paymentId: String(paymentId),
        pedidoId,
        estadoPagoInterno,
        externalReference,
        resumenPagoMp
    };
}

/**
 * Estado de pago para pantalla post-checkout (pedido WEB + último registro en pedidos_pagos).
 */
async function obtenerEstadoPagoPedidoCartaPublica(db, pedidoId) {
    const id = Number(pedidoId);
    if (!Number.isInteger(id) || id <= 0) {
        return { encontrado: false, motivo: 'id_invalido' };
    }

    const [pedidos] = await db.execute(
        `SELECT id, estado, medio_pago, estado_pago, total
         FROM pedidos
         WHERE id = ?
           AND UPPER(COALESCE(origen_pedido, '')) = 'WEB'`,
        [id]
    );

    if (pedidos.length === 0) {
        return { encontrado: false, motivo: 'pedido_no_encontrado' };
    }

    const pedido = pedidos[0];

    const [pagos] = await db.execute(
        `SELECT estado_proveedor, detalle_estado_proveedor, moneda
         FROM pedidos_pagos
         WHERE pedido_id = ?
         ORDER BY id DESC
         LIMIT 1`,
        [id]
    );

    const ultimoPago = pagos.length > 0 ? pagos[0] : null;
    const moneda = (ultimoPago?.moneda && String(ultimoPago.moneda).trim()) || MONEDA_ARS;

    return {
        encontrado: true,
        data: {
            pedido_id: id,
            estado_pedido: pedido.estado != null ? String(pedido.estado).trim() : null,
            medio_pago: pedido.medio_pago != null ? String(pedido.medio_pago).trim().toUpperCase() : null,
            estado_pago: pedido.estado_pago != null ? String(pedido.estado_pago).trim().toUpperCase() : null,
            estado_proveedor: ultimoPago?.estado_proveedor != null
                ? String(ultimoPago.estado_proveedor).trim()
                : null,
            detalle_estado_proveedor: ultimoPago?.detalle_estado_proveedor != null
                ? String(ultimoPago.detalle_estado_proveedor).trim()
                : null,
            total: parseFloat(pedido.total) || 0,
            moneda
        }
    };
}

module.exports = {
    crearCheckoutMercadoPago,
    procesarWebhookMercadoPago,
    obtenerEstadoPagoPedidoCartaPublica,
    helpers: {
        validarPayloadCheckout,
        recalcularCarrito,
        insertarPedido,
        insertarPedidoContenido,
        insertarPedidoPago,
        construirPreferenciaPayload,
        actualizarIdPreferencia,
        extraerPedidoIdDesdeReferencia,
        mapearEstadoMercadoPago,
        construirResumenPagoMp
    }
};
