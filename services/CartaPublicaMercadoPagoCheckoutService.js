const crypto = require('crypto');
const { MercadoPagoConfig, Preference, Payment } = require('mercadopago');
const { validarExtrasNoDobleYTriple, construirPersonalizaciones } = require('./PersonalizacionesService');
const { parseScheduledTime } = require('./ScheduledTimeParser');
const {
    obtenerUrlsBaseCheckoutProNormalizadas,
    assertUrlHttpsPublicaMercadoPago,
    MERCADO_PAGO_CHECKOUT_PUBLIC_URL_ERROR_MESSAGE
} = require('./mercadoPagoPreferenciaUrlHelper');
const { calcularTotalesDesdePrecioFinal } = require('./totalesPrecioFinal');
const { calcularPricingCompleto } = require('./cartaPedidoPricingService');
const { redeemCoupon } = require('./couponService');
const { notificarPedidoMercadoPagoAprobadoPorId } = require('./pedidoNotificacionWspService');
const {
    mapearEstadoMercadoPago,
    mapearEstadoPagoUiDesdeSesion,
    resolverAccionSesionMp,
    seleccionarPagoCanonicoMp,
    sesionReconciliable
} = require('./mercadoPagoPaymentStateMachine');
const {
    isHardeningEnabled,
    logMpEvent,
    incrementMetric
} = require('./mercadoPagoPaymentLogger');

const PROVEEDOR_MERCADOPAGO = 'MERCADOPAGO';
const MONEDA_ARS = 'ARS';
const ESTADO_PAGO_PENDIENTE = 'PENDIENTE';
const ESTADO_PAGO_PAGADO = 'PAGADO';
const ESTADO_PAGO_RECHAZADO = 'RECHAZADO';
const ESTADO_PAGO_CANCELADO = 'CANCELADO';

const PREFIJO_REF_SESION_MP = 'sesion_mp_';
const SESION_EXPIRACION_MINUTOS = 30;
const TOLERANCIA_MONTO_MP_ARS = 1.5;
const MP_LOCK_TIMEOUT_SEC = 10;
const MP_RECONCILE_CANCELADO_HORAS = 2;

const UUID_V4_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

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

async function recalcularCarrito(connection, items = [], couponCode = null) {
    const pricing = await calcularPricingCompleto(connection, items, couponCode);
    const { desglose, articulosNormalizados, montoDescuento, totalBruto, cupon } = pricing;

    const itemsNormalizados = articulosNormalizados.map((item) => ({
        articulo_id: item.articulo_id,
        articulo_nombre: item.articulo_nombre,
        cantidad: item.cantidad,
        precio_unitario: item.precio_unitario ?? item.precio,
        subtotal: item.subtotal,
        observaciones: item.observaciones || null,
        personalizaciones: item.personalizaciones || null
    }));

    return {
        itemsNormalizados,
        subtotal: desglose.subtotal,
        iva_total: desglose.iva_total,
        total: desglose.total,
        montoDescuento: montoDescuento || 0,
        subtotalBruto: totalBruto,
        cupon: cupon || null
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

async function insertarPedido(connection, payload, resumenCarrito, opciones = {}) {
    const estadoPago = opciones.estadoPago ?? ESTADO_PAGO_PENDIENTE;
    const horarioEntregaDate = normalizarHorarioEntrega(payload?.pedido?.horario_entrega);
    const query = `
        INSERT INTO pedidos (
            fecha, cliente_nombre, cliente_direccion, cliente_telefono, cliente_email,
            origen_pedido, subtotal, iva_total, total, medio_pago, estado_pago, modalidad, horario_entrega,
            estado, observaciones, monto_con_cuanto_abona, usuario_id, usuario_nombre,
            prioridad, tiempo_estimado_preparacion, hora_inicio_preparacion, transicion_automatica,
            cupon_id, cupon_codigo, descuento_cupon
        ) VALUES (
            NOW(), ?, ?, ?, ?, 'WEB', ?, ?, ?, ?, ?, ?, ?,
            'RECIBIDO', ?, NULL, NULL, NULL, ?, 15, NULL, TRUE, ?, ?, ?
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
        estadoPago,
        payload.pedido.modalidad,
        horarioEntregaDate,
        payload.pedido.observaciones || null,
        payload.pedido.prioridad || 'ALTA',
        resumenCarrito.cupon?.id ?? null,
        resumenCarrito.cupon?.codigo ?? null,
        resumenCarrito.montoDescuento || 0
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

async function insertarPedidoPago(connection, pedidoId, total, opciones = {}) {
    const referenciaExterna = opciones.referenciaExterna ?? `pedido_${pedidoId}`;
    const estadoPago = opciones.estadoPago ?? ESTADO_PAGO_PENDIENTE;
    const idPreferencia = opciones.idPreferencia ?? null;
    const idPago = opciones.idPago != null ? String(opciones.idPago) : null;
    const estadoProveedor = opciones.estadoProveedor
        ?? (estadoPago === ESTADO_PAGO_PENDIENTE ? 'preference_pending' : 'payment_notification');
    const detalleEstadoProveedor = opciones.detalleEstadoProveedor
        ?? (estadoPago === ESTADO_PAGO_PENDIENTE ? 'Pedido creado pendiente de preferencia' : 'Pago confirmado');
    const fechaAprobado = opciones.fechaAprobado ?? null;
    const datosAdicionales = opciones.datosAdicionales != null ? opciones.datosAdicionales : {};

    const query = `
        INSERT INTO pedidos_pagos (
            pedido_id, fecha, proveedor_pago, estado_pago, monto, moneda,
            referencia_externa, id_preferencia, id_pago, estado_proveedor,
            detalle_estado_proveedor, fecha_aprobado, fecha_ultima_notificacion,
            datos_adicionales, fecha_modificacion
        ) VALUES (?, NOW(), ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW(), ?, NOW())
    `;
    const values = [
        pedidoId,
        PROVEEDOR_MERCADOPAGO,
        estadoPago,
        total,
        MONEDA_ARS,
        referenciaExterna,
        idPreferencia,
        idPago,
        estadoProveedor,
        detalleEstadoProveedor,
        fechaAprobado,
        JSON.stringify(typeof datosAdicionales === 'object' ? datosAdicionales : {})
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

/**
 * Preferencia Checkout Pro asociada a una sesión (sin pedido en BD aún).
 */
function construirPreferenciaPayloadDesdeSesion({
    sessionId,
    total,
    modalidad,
    referenciaExterna,
    itemsNormalizados
}) {
    const { cartaFrontendBaseUrl: frontendBaseUrl, backendBaseUrl } = obtenerUrlsBaseCheckoutProNormalizadas();

    const descripcion = construirDescripcionPreferencia(itemsNormalizados);
    const baseResultUrl = `${frontendBaseUrl}/checkout/resultado?session_id=${encodeURIComponent(sessionId)}`;
    const backUrls = {
        success: `${baseResultUrl}&resultado=success`,
        pending: `${baseResultUrl}&resultado=pending`,
        failure: `${baseResultUrl}&resultado=failure`
    };

    assertBackUrlsValidas(backUrls);

    const payload = {
        items: [
            {
                id: `sesion_${sessionId}`,
                title: `Pedido El Chalito`,
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
            session_id: sessionId,
            origen: 'WEB',
            modulo: 'chalito_carta',
            modalidad,
            proveedor_pago: PROVEEDOR_MERCADOPAGO
        }
    };

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

    console.log('[MP][CheckoutPro][debug] CARTA_FRONTEND_URL:', cartUrl);
    console.log('[MP][CheckoutPro][debug] BACKEND_URL:', backUrl);
    console.log('[MP][CheckoutPro][debug] preferenceBody.back_urls:', JSON.stringify(backUrls, null, 2));
    console.log('[MP][CheckoutPro][debug] preferenceBody.notification_url:', notificationUrl);

    const client = getMercadoPagoClient();
    const preference = new Preference(client);
    return preference.create({ body: preferenciaPayload });
}

async function insertarSesionCheckoutMp(db, {
    sessionId,
    referenciaExterna,
    payloadCheckout,
    fechaExpiracionSql
}) {
    await db.execute(
        `INSERT INTO checkout_sesiones_mp (
            id, fecha_expiracion, estado, referencia_externa, payload_checkout
        ) VALUES (?, ?, 'PENDIENTE', ?, ?)`,
        [sessionId, fechaExpiracionSql, referenciaExterna, payloadCheckout]
    );
}

async function eliminarSesionCheckoutMp(db, sessionId) {
    await db.execute('DELETE FROM checkout_sesiones_mp WHERE id = ?', [sessionId]);
}

async function actualizarPreferenciaEnSesion(db, sessionId, idPreferencia) {
    await db.execute(
        `UPDATE checkout_sesiones_mp
         SET id_preferencia = ?, fecha_modificacion = NOW()
         WHERE id = ?`,
        [idPreferencia, sessionId]
    );
}

/**
 * Checkout MP: solo persiste sesión + preferencia. El pedido se crea al aprobar el pago.
 */
async function crearCheckoutMercadoPago(db, payload) {
    validarPayloadCheckout(payload);

    const connection = await db.getConnection();
    let resumenCarrito = null;
    let sessionId = null;
    let referenciaExterna = null;

    try {
        await connection.beginTransaction();
        resumenCarrito = await recalcularCarrito(connection, payload.items, payload.couponCode);
        await connection.commit();
    } catch (error) {
        try { await connection.rollback(); } catch (_) { /* noop */ }
        throw error;
    } finally {
        connection.release();
    }

    sessionId = crypto.randomUUID();
    referenciaExterna = `${PREFIJO_REF_SESION_MP}${sessionId}`;

    const payloadCheckout = {
        payload,
        couponCode: payload.couponCode || null,
        resumenCarrito: {
            itemsNormalizados: resumenCarrito.itemsNormalizados,
            subtotal: resumenCarrito.subtotal,
            iva_total: resumenCarrito.iva_total,
            total: resumenCarrito.total,
            montoDescuento: resumenCarrito.montoDescuento,
            subtotalBruto: resumenCarrito.subtotalBruto,
            cupon: resumenCarrito.cupon
        }
    };

    const fechaExp = new Date(Date.now() + SESION_EXPIRACION_MINUTOS * 60 * 1000);
    const fechaExpSql = fechaExp.toISOString().slice(0, 19).replace('T', ' ');

    try {
        await insertarSesionCheckoutMp(db, {
            sessionId,
            referenciaExterna,
            payloadCheckout,
            fechaExpiracionSql: fechaExpSql
        });

        const preferenciaPayload = construirPreferenciaPayloadDesdeSesion({
            sessionId,
            total: resumenCarrito.total,
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

        await actualizarPreferenciaEnSesion(db, sessionId, idPreferencia);

        return {
            ok: true,
            data: {
                session_id: sessionId,
                estado_sesion: 'PENDIENTE',
                total: resumenCarrito.total,
                moneda: MONEDA_ARS,
                referencia_externa: referenciaExterna,
                id_preferencia: idPreferencia,
                url_pago: urlPago
            }
        };
    } catch (error) {
        try {
            await eliminarSesionCheckoutMp(db, sessionId);
        } catch (_) { /* noop */ }
        return {
            ok: false,
            error,
            data: {
                session_id: sessionId,
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

function esReferenciaSesionMp(referenciaExterna) {
    return String(referenciaExterna || '').startsWith(PREFIJO_REF_SESION_MP);
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

function parsePayloadSesion(sesionRow) {
    const raw = sesionRow.payload_checkout;
    if (!raw) return null;
    if (typeof raw === 'object') return raw;
    try {
        return JSON.parse(String(raw));
    } catch {
        return null;
    }
}

async function crearPedidoDesdeSesion(connection, sesionRow, resumenPagoMp, paymentId) {
    const parsed = parsePayloadSesion(sesionRow);
    if (!parsed || !parsed.payload || !parsed.payload.items) {
        throw new Error('payload_checkout inválido en sesión MP');
    }

    const couponCode = parsed.couponCode ?? parsed.payload?.couponCode ?? null;
    const resumenCarrito = await recalcularCarrito(connection, parsed.payload.items, couponCode);
    const montoMp = Number(resumenPagoMp.transaction_amount);
    if (Number.isFinite(montoMp) && Math.abs(montoMp - Number(resumenCarrito.total)) > TOLERANCIA_MONTO_MP_ARS) {
        throw new Error(
            `Monto MP (${montoMp}) no coincide con total recalculado (${resumenCarrito.total})`
        );
    }

    const pedidoId = await insertarPedido(connection, parsed.payload, resumenCarrito, {
        estadoPago: ESTADO_PAGO_PAGADO
    });
    await insertarPedidoContenido(connection, pedidoId, resumenCarrito.itemsNormalizados);

    if (resumenCarrito.cupon?.id && resumenCarrito.montoDescuento > 0) {
        await redeemCoupon(resumenCarrito.cupon.id, pedidoId, resumenCarrito.montoDescuento, connection);
    }

    const fechaAprobadoParseada = resumenPagoMp.date_approved ? new Date(resumenPagoMp.date_approved) : null;
    const fechaAprobadoValida = fechaAprobadoParseada && !Number.isNaN(fechaAprobadoParseada.getTime())
        ? fechaAprobadoParseada
        : new Date();

    await insertarPedidoPago(connection, pedidoId, resumenCarrito.total, {
        referenciaExterna: sesionRow.referencia_externa,
        estadoPago: ESTADO_PAGO_PAGADO,
        idPreferencia: sesionRow.id_preferencia,
        idPago: String(paymentId),
        estadoProveedor: resumenPagoMp.status,
        detalleEstadoProveedor: resumenPagoMp.status_detail,
        fechaAprobado: fechaAprobadoValida,
        datosAdicionales: resumenPagoMp
    });

    await connection.execute(
        `UPDATE checkout_sesiones_mp
         SET estado = 'PROCESADO',
             pedido_id = ?,
             id_pago = ?,
             estado_mp = ?,
             fecha_modificacion = NOW()
         WHERE id = ?`,
        [pedidoId, String(paymentId), resumenPagoMp.status, sesionRow.id]
    );

    return pedidoId;
}

function buildLockKeySesionMp(sessionId) {
    return `mp_sesion_${String(sessionId)}`;
}

async function adquirirLockMp(connection, lockKey) {
    const [rows] = await connection.execute('SELECT GET_LOCK(?, ?) AS acquired', [lockKey, MP_LOCK_TIMEOUT_SEC]);
    const acquired = Number(rows?.[0]?.acquired) === 1;
    if (!acquired) {
        incrementMetric('locksFallidos');
        logMpEvent('warn', 'mp_lock_no_adquirido', { lockKey });
    }
    return acquired;
}

async function liberarLockMp(connection, lockKey) {
    try {
        await connection.execute('SELECT RELEASE_LOCK(?)', [lockKey]);
    } catch (_) { /* noop */ }
}

async function actualizarActividadMpSesion(connection, sesionId, paymentId, estadoProveedor, opciones = {}) {
    const { marcarCancelado = false } = opciones;
    const estadoSet = marcarCancelado
        ? `estado = 'CANCELADO',`
        : '';
    await connection.execute(
        `UPDATE checkout_sesiones_mp
         SET ${estadoSet}
             id_pago = ?,
             estado_mp = ?,
             fecha_modificacion = NOW()
         WHERE id = ?
           AND estado IN ('PENDIENTE', 'CANCELADO')`,
        [String(paymentId), estadoProveedor, sesionId]
    );
}

async function procesarPagoSesionMpConLock(db, sesionInicial, resumenPagoMp, paymentId) {
    const connection = await db.getConnection();
    const lockKey = buildLockKeySesionMp(sesionInicial.id);
    const estadoProveedor = resumenPagoMp.status;
    const estadoPagoInterno = mapearEstadoMercadoPago(estadoProveedor);

    try {
        await connection.beginTransaction();

        const lockOk = await adquirirLockMp(connection, lockKey);
        if (!lockOk) {
            await connection.rollback();
            return {
                procesado: false,
                motivo: 'lock_no_adquirido',
                paymentId: String(paymentId),
                externalReference: resumenPagoMp.external_reference
            };
        }

        const [locked] = await connection.execute(
            'SELECT * FROM checkout_sesiones_mp WHERE id = ? FOR UPDATE',
            [sesionInicial.id]
        );

        if (locked.length === 0) {
            await liberarLockMp(connection, lockKey);
            await connection.rollback();
            return {
                procesado: false,
                motivo: 'sesion_perdida',
                paymentId: String(paymentId),
                externalReference: resumenPagoMp.external_reference
            };
        }

        const row = locked[0];
        const accion = resolverAccionSesionMp({
            estadoSesion: row.estado,
            estadoProveedor,
            pedidoIdExistente: row.pedido_id
        });

        logMpEvent('info', 'mp_sesion_accion', {
            sessionId: row.id,
            paymentId: String(paymentId),
            estadoSesion: row.estado,
            estadoProveedor,
            accion,
            hardening: isHardeningEnabled()
        });

        if (accion === 'idempotente') {
            await liberarLockMp(connection, lockKey);
            await connection.commit();
            return {
                procesado: true,
                esPagoNuevo: false,
                pedidoId: row.pedido_id ? Number(row.pedido_id) : null,
                estadoPagoInterno,
                externalReference: row.referencia_externa,
                resumenPagoMp,
                paymentId: String(paymentId),
                pagoRecienConfirmadoLegacy: false,
                motivo: 'sesion_ya_procesada'
            };
        }

        if (accion === 'ignorar') {
            await liberarLockMp(connection, lockKey);
            await connection.commit();
            incrementMetric('aprobacionesIgnoradas');
            return {
                procesado: true,
                esPagoNuevo: false,
                pedidoId: null,
                estadoPagoInterno,
                externalReference: row.referencia_externa,
                resumenPagoMp,
                paymentId: String(paymentId),
                pagoRecienConfirmadoLegacy: false,
                motivo: 'sesion_expirada_sin_aprobacion'
            };
        }

        if (accion === 'crear_pedido') {
            const pedidoId = await crearPedidoDesdeSesion(connection, row, resumenPagoMp, paymentId);
            await liberarLockMp(connection, lockKey);
            await connection.commit();

            incrementMetric('aprobacionesCreadas');
            try {
                await notificarPedidoMercadoPagoAprobadoPorId(pedidoId);
            } catch (err) {
                console.warn('⚠️ [WA] No se pudo enviar notificación MP aprobado:', err.message);
            }

            return {
                procesado: true,
                esPagoNuevo: true,
                pedidoId,
                estadoPagoInterno,
                externalReference: row.referencia_externa,
                resumenPagoMp,
                paymentId: String(paymentId),
                pagoRecienConfirmadoLegacy: false,
                motivo: 'pedido_creado_desde_sesion'
            };
        }

        if (accion === 'actualizar_pendiente') {
            await actualizarActividadMpSesion(connection, row.id, paymentId, estadoProveedor);
            await liberarLockMp(connection, lockKey);
            await connection.commit();
            return {
                procesado: true,
                esPagoNuevo: false,
                pedidoId: null,
                estadoPagoInterno,
                externalReference: row.referencia_externa,
                resumenPagoMp,
                paymentId: String(paymentId),
                pagoRecienConfirmadoLegacy: false,
                motivo: 'sesion_pendiente_actualizada'
            };
        }

        if (accion === 'registrar_no_aprobado') {
            if (isHardeningEnabled()) {
                await actualizarActividadMpSesion(connection, row.id, paymentId, estadoProveedor);
            } else {
                await actualizarActividadMpSesion(connection, row.id, paymentId, estadoProveedor, {
                    marcarCancelado: true
                });
            }
            incrementMetric('rechazosRegistrados');
            await liberarLockMp(connection, lockKey);
            await connection.commit();
            return {
                procesado: true,
                esPagoNuevo: false,
                pedidoId: null,
                estadoPagoInterno,
                externalReference: row.referencia_externa,
                resumenPagoMp,
                paymentId: String(paymentId),
                pagoRecienConfirmadoLegacy: false,
                motivo: isHardeningEnabled() ? 'rechazo_registrado_sesion_abierta' : 'sesion_cancelada_legacy'
            };
        }

        await liberarLockMp(connection, lockKey);
        await connection.commit();
        return {
            procesado: true,
            esPagoNuevo: false,
            pedidoId: null,
            estadoPagoInterno,
            externalReference: row.referencia_externa,
            resumenPagoMp,
            paymentId: String(paymentId),
            pagoRecienConfirmadoLegacy: false,
            motivo: 'accion_no_aplicada'
        };
    } catch (err) {
        try { await connection.rollback(); } catch (_) { /* noop */ }
        try { await liberarLockMp(connection, lockKey); } catch (_) { /* noop */ }
        incrementMetric('erroresProcesamiento');
        console.error('❌ [MP] Error procesando sesión con lock:', err.message);
        throw err;
    } finally {
        connection.release();
    }
}

async function buscarPagosPorReferenciaExterna(referenciaExterna) {
    const client = getMercadoPagoClient();
    const paymentClient = new Payment(client);
    const searchRes = await paymentClient.search({
        options: {
            sort: 'date_created',
            criteria: 'desc',
            external_reference: referenciaExterna
        }
    });
    return Array.isArray(searchRes?.results) ? searchRes.results : [];
}

async function reconciliarReferenciaExternaMp(db, referenciaExterna, opciones = {}) {
    const { origen = 'manual' } = opciones;
    incrementMetric('reconciliacionesEjecutadas');
    logMpEvent('info', 'mp_reconciliacion_iniciada', { referenciaExterna, origen });

    const results = await buscarPagosPorReferenciaExterna(referenciaExterna);
    const candidato = seleccionarPagoCanonicoMp(results);
    if (!candidato?.id) {
        return {
            reconciliado: false,
            motivo: 'sin_pagos_en_mp',
            referenciaExterna
        };
    }

    const full = await obtenerPagoMercadoPago(String(candidato.id));
    const resumen = construirResumenPagoMp(full);
    const resultado = await procesarPagoMercadoPagoInterno(db, resumen, String(candidato.id));

    if (resultado?.pedidoId && String(resultado.estadoPagoInterno || '').toUpperCase() === ESTADO_PAGO_PAGADO) {
        incrementMetric('aprobacionesRecuperadas');
    }

    return {
        reconciliado: Boolean(resultado?.procesado),
        referenciaExterna,
        paymentId: String(candidato.id),
        resultado
    };
}

async function reconciliarSesionMpPorId(db, sessionIdRaw, opciones = {}) {
    const sessionId = String(sessionIdRaw || '').trim();
    if (!UUID_V4_RE.test(sessionId)) {
        return { encontrado: false, motivo: 'id_invalido' };
    }

    const [rows] = await db.execute(
        `SELECT id, estado, referencia_externa, pedido_id
         FROM checkout_sesiones_mp
         WHERE id = ?
         LIMIT 1`,
        [sessionId]
    );

    if (rows.length === 0) {
        return { encontrado: false, motivo: 'sesion_no_encontrada' };
    }

    const sesion = rows[0];
    if (!sesionReconciliable(sesion.estado) && String(sesion.estado || '').toUpperCase() !== 'PROCESADO') {
        return {
            encontrado: true,
            reconciliado: false,
            motivo: 'sesion_no_reconciliable',
            sessionId
        };
    }

    if (String(sesion.estado || '').toUpperCase() === 'PROCESADO' && sesion.pedido_id) {
        return {
            encontrado: true,
            reconciliado: true,
            motivo: 'sesion_ya_procesada',
            sessionId,
            pedidoId: Number(sesion.pedido_id)
        };
    }

    const resultadoRecon = await reconciliarReferenciaExternaMp(db, sesion.referencia_externa, {
        origen: opciones.origen || 'sesion'
    });

    return {
        encontrado: true,
        sessionId,
        ...resultadoRecon
    };
}

/**
 * Núcleo compartido webhook + worker de reconciliación.
 */
async function procesarPagoMercadoPagoInterno(db, resumenPagoMp, paymentId) {
    const externalReference = resumenPagoMp.external_reference;
    if (!externalReference) {
        return { procesado: false, motivo: 'sin_referencia_externa', paymentId: String(paymentId) };
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

    if (esReferenciaSesionMp(externalReference)) {
        const [sesionRows] = await db.execute(
            `SELECT * FROM checkout_sesiones_mp WHERE referencia_externa = ? LIMIT 1`,
            [externalReference]
        );

        if (sesionRows.length === 0) {
            return {
                procesado: false,
                motivo: 'sesion_no_encontrada',
                paymentId: String(paymentId),
                externalReference
            };
        }

        incrementMetric('webhooksProcesados');
        return procesarPagoSesionMpConLock(db, sesionRows[0], resumenPagoMp, paymentId);
    }

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

    let estadoAnteriorPago = null;
    if (pedidoId) {
        const [pedidoRows] = await db.execute(
            `SELECT estado_pago
             FROM pedidos
             WHERE id = ?
             LIMIT 1`,
            [pedidoId]
        );
        if (pedidoRows.length > 0) {
            estadoAnteriorPago = String(pedidoRows[0].estado_pago || '').trim().toUpperCase() || null;
        }
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

    let pagoRecienConfirmadoLegacy = false;
    if (pedidoId) {
        await db.execute(
            `UPDATE pedidos
             SET estado_pago = ?,
                 fecha_modificacion = NOW()
             WHERE id = ?`,
            [estadoPagoInterno, pedidoId]
        );

        if (estadoPagoInterno === ESTADO_PAGO_PAGADO && estadoAnteriorPago !== ESTADO_PAGO_PAGADO) {
            pagoRecienConfirmadoLegacy = true;
            try {
                await notificarPedidoMercadoPagoAprobadoPorId(pedidoId);
            } catch (err) {
                console.warn('⚠️ [WA] No se pudo enviar notificación MP aprobado:', err.message);
            }
        }
    }

    return {
        procesado: true,
        paymentId: String(paymentId),
        pedidoId,
        esPagoNuevo: false,
        estadoPagoInterno,
        externalReference,
        resumenPagoMp,
        pagoRecienConfirmadoLegacy
    };
}

async function procesarWebhookMercadoPago(db, req) {
    const { type, paymentId } = extraerNotificacionMercadoPago(req);
    if (!type || type !== 'payment' || !paymentId) {
        return { procesado: false, motivo: 'notificacion_ignorada' };
    }

    const pago = await obtenerPagoMercadoPago(paymentId);
    const resumenPagoMp = construirResumenPagoMp(pago);
    return procesarPagoMercadoPagoInterno(db, resumenPagoMp, paymentId);
}

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

async function obtenerEstadoSesionMp(db, sessionIdRaw) {
    const sessionId = String(sessionIdRaw || '').trim();
    if (!UUID_V4_RE.test(sessionId)) {
        return { encontrado: false, motivo: 'id_invalido' };
    }

    const [rows] = await db.execute(
        `SELECT id, estado, pedido_id, estado_mp, referencia_externa, fecha_expiracion, payload_checkout
         FROM checkout_sesiones_mp
         WHERE id = ?
         LIMIT 1`,
        [sessionId]
    );

    if (rows.length === 0) {
        return { encontrado: false, motivo: 'sesion_no_encontrada' };
    }

    const sesion = rows[0];
    let pedido = null;
    if (sesion.pedido_id) {
        const [pRows] = await db.execute(
            `SELECT id, estado, medio_pago, estado_pago, total
             FROM pedidos
             WHERE id = ?
             LIMIT 1`,
            [sesion.pedido_id]
        );
        pedido = pRows.length > 0 ? pRows[0] : null;
    }

    const estadoPagoUi = mapearEstadoPagoUiDesdeSesion(sesion, pedido);

    let totalMostrar = pedido ? (parseFloat(pedido.total) || 0) : null;
    if (totalMostrar == null && sesion.payload_checkout) {
        const parsed = parsePayloadSesion(sesion);
        const t = parsed?.resumenCarrito?.total;
        if (t != null && Number.isFinite(Number(t))) {
            totalMostrar = Number(t);
        }
    }

    return {
        encontrado: true,
        data: {
            session_id: sessionId,
            estado_sesion: String(sesion.estado || '').toUpperCase(),
            pedido_id: sesion.pedido_id ? Number(sesion.pedido_id) : null,
            estado_pedido: pedido?.estado != null ? String(pedido.estado).trim() : null,
            estado_pago: estadoPagoUi,
            total: totalMostrar,
            moneda: MONEDA_ARS,
            estado_mp: sesion.estado_mp != null ? String(sesion.estado_mp).trim() : null,
            fecha_expiracion: sesion.fecha_expiracion
        }
    };
}

async function ejecutarReconciliacionSesionesMp(db, sesiones = [], opciones = {}) {
    const { io = null } = opciones;
    let reconciliadas = 0;

    for (const row of sesiones) {
        try {
            const resultadoRecon = await reconciliarReferenciaExternaMp(db, row.referencia_externa, {
                origen: 'worker'
            });
            const resultadoPago = resultadoRecon?.resultado;
            if (!resultadoPago?.procesado) {
                continue;
            }

            if (resultadoPago?.pedidoId && String(resultadoPago.estadoPagoInterno || '').toUpperCase() === ESTADO_PAGO_PAGADO) {
                try {
                    const { procesarAprobacionMercadoPago } = require('./PedidoPostPagoService');
                    await procesarAprobacionMercadoPago({
                        pedidoId: resultadoPago.pedidoId,
                        paymentId: resultadoRecon.paymentId,
                        resumenPagoMp: resultadoPago.resumenPagoMp,
                        io
                    });
                } catch (autoCobroErr) {
                    console.warn(
                        `⚠️ [MP][Worker] Auto-cobro pedido #${resultadoPago.pedidoId}:`,
                        autoCobroErr.message
                    );
                }
            }

            reconciliadas += 1;
        } catch (e) {
            console.warn(`⚠️ [MP][Worker] Reconciliación sesión ${row.id}:`, e.message);
        }
    }

    return reconciliadas;
}

/**
 * Worker: expira sesiones, limpia filas viejas, reconcilia pagos contra la API MP.
 */
async function ejecutarMantenimientoSesionesMercadoPago(db, opciones = {}) {
    const { io = null } = opciones;

    await db.execute(
        `UPDATE checkout_sesiones_mp
         SET estado = 'EXPIRADO', fecha_modificacion = NOW()
         WHERE estado = 'PENDIENTE'
           AND fecha_expiracion < NOW()`
    );

    await db.execute(
        `DELETE FROM checkout_sesiones_mp
         WHERE estado IN ('CANCELADO', 'EXPIRADO')
           AND fecha < DATE_SUB(NOW(), INTERVAL 24 HOUR)`
    );

    const [pendientes] = await db.execute(
        `SELECT id, referencia_externa
         FROM checkout_sesiones_mp
         WHERE estado = 'PENDIENTE'
           AND fecha < DATE_SUB(NOW(), INTERVAL 5 MINUTE)`
    );

    const [canceladasRecientes] = await db.execute(
        `SELECT id, referencia_externa
         FROM checkout_sesiones_mp
         WHERE estado = 'CANCELADO'
           AND pedido_id IS NULL
           AND fecha_modificacion >= DATE_SUB(NOW(), INTERVAL ? HOUR)`,
        [MP_RECONCILE_CANCELADO_HORAS]
    );

    const sesionesAReconciliar = [...pendientes, ...canceladasRecientes];
    const reconciliadas = await ejecutarReconciliacionSesionesMp(db, sesionesAReconciliar, { io });

    const { reconciliarPedidosMpPagadosSinVenta } = require('./PedidoPostPagoService');
    const ventasRecuperadas = await reconciliarPedidosMpPagadosSinVenta();

    return {
        reconciliadas,
        ventasRecuperadas: ventasRecuperadas.recuperados ?? 0,
        sesionesRevisadas: sesionesAReconciliar.length
    };
}

module.exports = {
    crearCheckoutMercadoPago,
    procesarWebhookMercadoPago,
    obtenerEstadoPagoPedidoCartaPublica,
    obtenerEstadoSesionMp,
    ejecutarMantenimientoSesionesMercadoPago,
    procesarPagoMercadoPagoInterno,
    reconciliarSesionMpPorId,
    reconciliarReferenciaExternaMp,
    helpers: {
        validarPayloadCheckout,
        recalcularCarrito,
        insertarPedido,
        insertarPedidoContenido,
        insertarPedidoPago,
        construirPreferenciaPayload: construirPreferenciaPayloadDesdeSesion,
        extraerPedidoIdDesdeReferencia,
        mapearEstadoMercadoPago,
        construirResumenPagoMp,
        esReferenciaSesionMp
    }
};
