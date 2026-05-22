/**
 * Controller para pedidos desde carta pública (carta online)
 * POST /carta-publica/pedidos - Crea pedido real que aparece en admin PEDIDOS
 *
 * Modalidad de entrega (backend es fuente de verdad):
 * - HORA_PROGRAMADA: estado=RECIBIDO, prioridad=NORMAL, horario_entrega guardado, NO auto EN_PREPARACION
 * - CUANTO_ANTES: prioridad=ALTA, horario_entrega=NULL, puede pasar a EN_PREPARACION si hay capacidad
 *
 * Acepta: when ("CUANTO_ANTES"|"HORA_PROGRAMADA"), scheduledTime/horarioEntrega/horario_entrega/deliveryTime
 */
const db = require('./dbPromise');
const TimeCalculationService = require('../services/TimeCalculationService');
const KitchenCapacityService = require('../services/KitchenCapacityService');
const { OrderQueueEngine } = require('../services/OrderQueueEngine');
const { pedidoEstaHabilitadoOperativamente } = require('../services/pedidoOperativoHelper');
const { validateMontoConCuantoAbonaEfectivo } = require('../services/montoConCuantoAbonaRules');
const { parseScheduledTime } = require('../services/ScheduledTimeParser');
const storeScheduleService = require('../services/storeScheduleService');
const { isStoreOpen, isValidScheduledDateTime, getNowInStoreTimezone } = storeScheduleService;
const { enrichPedidoRealtime, buildPedidoSnapshotById } = require('../services/pedidoRealtimeSerializer');
const { calcularPricingCompleto } = require('../services/cartaPedidoPricingService');
const { redeemCoupon } = require('../services/couponService');
const ClientesService = require('../services/ClientesService');
const {
    notificarPedidoEfectivo,
    notificarPedidoTransferencia
} = require('../services/pedidoNotificacionWspService');

function parseMontoConCuantoAbona(value) {
    if (value === null || value === undefined) return null;
    if (typeof value === 'number') {
        if (!Number.isFinite(value)) return null;
        return value;
    }

    const raw = String(value).trim();
    if (!raw) return null;

    const normalized = raw.replace(',', '.');
    const parsed = Number(normalized);
    if (!Number.isFinite(parsed)) return null;
    return parsed;
}

/**
 * Normaliza y valida la modalidad de entrega del payload.
 * @returns {{ esHoraProgramada: boolean, horarioEntregaDate: Date|null, prioridadFinal: string } | { error: string }}
 */
function normalizarModalidadEntrega(data) {
    const when = data.when;
    const scheduledTimeRaw = data.scheduledTime ?? data.horarioEntrega ?? data.horario_entrega ?? data.deliveryTime;
    const prioridadExplicita = data.prioridad;

    // Si when es explícito, usarlo como fuente de verdad
    if (when === 'HORA_PROGRAMADA') {
        if (!scheduledTimeRaw || (typeof scheduledTimeRaw === 'string' && !scheduledTimeRaw.trim())) {
            return { error: 'Debés indicar un horario programado válido.' };
        }
        const parsed = parseScheduledTime(scheduledTimeRaw);
        if (parsed.error) {
            return { error: parsed.error };
        }
        return {
            esHoraProgramada: true,
            horarioEntregaDate: parsed.date,
            prioridadFinal: 'NORMAL'
        };
    }

    if (when === 'CUANTO_ANTES') {
        return {
            esHoraProgramada: false,
            horarioEntregaDate: null,
            prioridadFinal: 'ALTA'
        };
    }

    // Compatibilidad: si no viene when, inferir de scheduledTime (alias)
    if (scheduledTimeRaw && (typeof scheduledTimeRaw === 'string' ? scheduledTimeRaw.trim() : scheduledTimeRaw)) {
        const parsed = parseScheduledTime(scheduledTimeRaw);
        if (!parsed.error && parsed.date) {
            return {
                esHoraProgramada: true,
                horarioEntregaDate: parsed.date,
                prioridadFinal: 'NORMAL'
            };
        }
    }

    // Default: CUANTO_ANTES (comportamiento legacy)
    return {
        esHoraProgramada: false,
        horarioEntregaDate: null,
        prioridadFinal: prioridadExplicita === 'ALTA' ? 'ALTA' : 'ALTA'
    };
}

/**
 * Crear pedido desde carta online
 * POST /carta-publica/pedidos
 */
const crearPedidoCarta = async (req, res) => {
    const connection = await db.getConnection();

    try {
        const data = req.validatedData;
        const modalidad = normalizarModalidadEntrega(data);
        if (modalidad.error) {
            return res.status(400).json({
                success: false,
                message: modalidad.error
            });
        }

        const { esHoraProgramada, horarioEntregaDate, prioridadFinal } = modalidad;

        const estadoTienda = await storeScheduleService.getEstadoTienda();

        if (estadoTienda.bloqueado) {
            return res.status(400).json({
                success: false,
                message: estadoTienda.mensaje || 'La tienda online no está disponible en este momento.'
            });
        }

        // Validación de horarios de atención (backend es fuente de verdad)
        if (estadoTienda.validarHorarios) {
            if (esHoraProgramada) {
                if (!horarioEntregaDate) {
                    return res.status(400).json({
                        success: false,
                        message: 'Debés indicar un horario programado válido.'
                    });
                }
                if (!(await isValidScheduledDateTime(horarioEntregaDate))) {
                    return res.status(400).json({
                        success: false,
                        message: 'El horario programado está fuera del horario de atención.'
                    });
                }
            } else {
                const now = getNowInStoreTimezone();
                if (!(await isStoreOpen(now))) {
                    return res.status(400).json({
                        success: false,
                        message: 'El local está cerrado y no está tomando pedidos en este momento.'
                    });
                }
            }
        }
        const { customer, deliveryType, address, paymentMethod, notes, items } = data;
        const medioPagoNormalizado = String(paymentMethod || '').trim().toUpperCase();
        const montoRaw = data.conCuantoAbona ?? data.cashGiven;
        const montoConCuantoAbona = medioPagoNormalizado === 'EFECTIVO'
            ? parseMontoConCuantoAbona(montoRaw)
            : null;

        if (medioPagoNormalizado === 'EFECTIVO' && (montoConCuantoAbona === null || montoConCuantoAbona <= 0)) {
            return res.status(400).json({
                success: false,
                message: 'Si el medio de pago es EFECTIVO, debés indicar un monto válido en conCuantoAbona/cashGiven.'
            });
        }

        await connection.beginTransaction();

        const couponCode = data.couponCode ?? data.cuponCodigo ?? null;
        let pricing;

        try {
            pricing = await calcularPricingCompleto(connection, items, couponCode);
        } catch (pricingError) {
            await connection.rollback();
            if (pricingError.code === 'CUPON_INVALIDO') {
                return res.status(400).json({
                    success: false,
                    message: pricingError.message,
                    code: 'CUPON_INVALIDO'
                });
            }
            if (pricingError.code === 'EXTRAS_DOBLE_TRIPLE_INCOMPATIBLES') {
                return res.status(400).json({
                    success: false,
                    message: pricingError.message,
                    code: 'EXTRAS_DOBLE_TRIPLE_INCOMPATIBLES'
                });
            }
            return res.status(400).json({
                success: false,
                message: pricingError.message || 'Error al calcular el carrito'
            });
        }

        const {
            articulosNormalizados,
            desglose,
            montoDescuento,
            cupon
        } = pricing;
        const { subtotal: subtotalPedido, iva_total: ivaTotal, total } = desglose;

        if (medioPagoNormalizado === 'EFECTIVO') {
            const validacionMonto = validateMontoConCuantoAbonaEfectivo(montoConCuantoAbona, total);
            if (!validacionMonto.ok) {
                await connection.rollback();
                return res.status(400).json({
                    success: false,
                    message: validacionMonto.message,
                    code: validacionMonto.code
                });
            }
        }

        const tiempoPlaceholder = 15;
        let horaInicioPreparacion = null;
        if (horarioEntregaDate) {
            horaInicioPreparacion = new Date(horarioEntregaDate.getTime() - tiempoPlaceholder * 60 * 1000);
        }

        const clienteEntidad = await ClientesService.findOrCreate({
            nombre: customer.nombre,
            telefono: customer.telefono,
            email: customer.email || null,
            direccion: address || null
        }, connection);

        // Insert pedidos
        const pedidoQuery = `
            INSERT INTO pedidos (
                cliente_id, fecha, cliente_nombre, cliente_direccion, cliente_telefono, cliente_email,
                origen_pedido, subtotal, iva_total, total, medio_pago, estado_pago, modalidad, horario_entrega,
                estado, observaciones, monto_con_cuanto_abona, usuario_id, usuario_nombre,
                prioridad, tiempo_estimado_preparacion, hora_inicio_preparacion, transicion_automatica,
                cupon_id, cupon_codigo, descuento_cupon
            ) VALUES (?, NOW(), ?, ?, ?, ?, 'WEB', ?, ?, ?, ?, 'PENDIENTE', ?, ?, 'RECIBIDO', ?, ?, NULL, NULL, ?, ?, ?, ?, ?, ?, ?)
        `;

        const pedidoValues = [
            clienteEntidad?.id || null,
            customer.nombre,
            address || null,
            customer.telefono,
            customer.email || null,
            subtotalPedido,
            ivaTotal,
            total,
            paymentMethod,
            deliveryType,
            horarioEntregaDate || null,
            notes || null,
            montoConCuantoAbona,
            prioridadFinal,
            tiempoPlaceholder,
            horaInicioPreparacion,
            true,
            cupon?.id ?? null,
            cupon?.codigo ?? null,
            montoDescuento || 0
        ];

        const [pedidoResult] = await connection.execute(pedidoQuery, pedidoValues);
        const pedidoId = pedidoResult.insertId;

        // Insert pedidos_contenido
        const articuloQuery = `
            INSERT INTO pedidos_contenido (
                pedido_id, articulo_id, articulo_nombre, cantidad, precio, subtotal,
                personalizaciones, observaciones
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        `;

        for (const art of articulosNormalizados) {
            await connection.execute(articuloQuery, [
                pedidoId,
                art.articulo_id,
                art.articulo_nombre,
                art.cantidad,
                art.precio,
                art.subtotal,
                art.personalizaciones ? JSON.stringify(art.personalizaciones) : null,
                art.observaciones
            ]);

            await connection.execute(
                'UPDATE articulos SET stock_actual = stock_actual - ? WHERE id = ? AND controla_stock = 1',
                [art.cantidad, art.articulo_id]
            );
        }

        // Recalcular tiempo_estimado_preparacion según peso de artículos
        const tiempoEstimadoReal = await TimeCalculationService.calcularTiempoEstimadoPedido(pedidoId, { connection });
        let horaInicioPreparacionFinal = null;
        if (horarioEntregaDate) {
            horaInicioPreparacionFinal = new Date(horarioEntregaDate.getTime() - tiempoEstimadoReal * 60 * 1000);
        }
        await connection.execute(
            'UPDATE pedidos SET tiempo_estimado_preparacion = ?, hora_inicio_preparacion = ? WHERE id = ?',
            [tiempoEstimadoReal, horaInicioPreparacionFinal, pedidoId]
        );

        if (cupon?.id && montoDescuento > 0) {
            await redeemCoupon(cupon.id, pedidoId, montoDescuento, connection);
        }

        await connection.commit();

        // Solo "cuanto antes" puede pasar a EN_PREPARACION automáticamente.
        // HORA_PROGRAMADA: queda RECIBIDO, el OrderQueueEngine lo moverá cuando llegue el momento.
        let estadoFinal = 'RECIBIDO';
        let enPreparacionAuto = false;

        const [filasOperativo] = await db.execute(
            'SELECT origen_pedido, medio_pago, estado_pago FROM pedidos WHERE id = ?',
            [pedidoId]
        );
        const puedeEntrarACocinaAutomatico = filasOperativo.length > 0
            && pedidoEstaHabilitadoOperativamente(filasOperativo[0]);

        if (!esHoraProgramada && puedeEntrarACocinaAutomatico) {
            try {
                const hayCapacidad = await KitchenCapacityService.hayCapacidadDisponible();
                if (hayCapacidad) {
                    await connection.beginTransaction();
                    await OrderQueueEngine.moverPedidoAPreparacion(connection, pedidoId);
                    await connection.commit();
                    estadoFinal = 'EN_PREPARACION';
                    enPreparacionAuto = true;
                    console.log(`⚡ [cartaPublica] Pedido #${pedidoId} "cuanto antes" entró a EN_PREPARACION automáticamente`);
                } else {
                    const infoCapacidad = await KitchenCapacityService.obtenerInfoCapacidad();
                    const obsActual = notes || '';
                    const obsNueva = obsActual ? `${obsActual} | Cuanto antes: en cola por capacidad` : 'Cuanto antes: en cola por capacidad';
                    await connection.execute(
                        'UPDATE pedidos SET observaciones = ? WHERE id = ?',
                        [obsNueva, pedidoId]
                    );
                    console.log(`⏳ [cartaPublica] Pedido #${pedidoId} en cola (${infoCapacidad.pedidosEnPreparacion}/${infoCapacidad.capacidadMaxima}), worker lo procesará`);
                }
            } catch (err) {
                try { await connection.rollback(); } catch (_) { /* ignorar */ }
                console.error('⚠️ [cartaPublica] Error al evaluar EN_PREPARACION automático (pedido queda RECIBIDO, worker lo procesará):', err.message);
            }
        } else if (!puedeEntrarACocinaAutomatico) {
            console.log(`💳 [cartaPublica] Pedido #${pedidoId}: bloqueado para cocina automática hasta pago acreditado (MP / transferencia web).`);
        }

        // Emitir evento WebSocket para admin (estado final)
        const io = req.app.get('io');
        if (io) {
            try {
                const [pedidoCreado] = await db.execute('SELECT * FROM pedidos WHERE id = ?', [pedidoId]);
                if (pedidoCreado.length > 0) {
                    const { getInstance: getSocketService } = require('../services/SocketService');
                    const socketService = getSocketService(io);
                    if (socketService) {
                        const snapshot = await buildPedidoSnapshotById({
                            pedidoId,
                            connection: db,
                            includeArticulos: true
                        });
                        socketService.emitPedidoCreado(snapshot || enrichPedidoRealtime({ id: pedidoId, ...pedidoCreado[0] }));
                        if (enPreparacionAuto) {
                            socketService.emitPedidoEstadoCambiado(
                                pedidoId,
                                'RECIBIDO',
                                'EN_PREPARACION',
                                snapshot || enrichPedidoRealtime(pedidoCreado[0])
                            );
                            const infoCapacidad = await KitchenCapacityService.obtenerInfoCapacidad();
                            socketService.emitCapacidadActualizada(infoCapacidad);
                        }
                    }
                }
            } catch (err) {
                console.warn('⚠️ No se pudo emitir WebSocket para pedido carta:', err.message);
            }
        }

        try {
            if (medioPagoNormalizado === 'EFECTIVO') {
                await notificarPedidoEfectivo({
                    id: pedidoId,
                    cliente_telefono: customer.telefono,
                    total,
                    modalidad: deliveryType,
                    items: articulosNormalizados,
                });
            } else if (medioPagoNormalizado === 'TRANSFERENCIA') {
                await notificarPedidoTransferencia({
                    id: pedidoId,
                    cliente_telefono: customer.telefono,
                    total,
                    modalidad: deliveryType,
                    items: articulosNormalizados,
                });
            }
        } catch (err) {
            console.warn('⚠️ [WA] No se pudo enviar notificación WhatsApp:', err.message);
        }

        const response = {
            success: true,
            pedidoId,
            estadoFinal,
            subtotal: parseFloat(subtotalPedido),
            iva_total: parseFloat(ivaTotal),
            total: parseFloat(total),
            enPreparacionAuto,
            modalidadEntrega: esHoraProgramada ? 'HORA_PROGRAMADA' : 'CUANTO_ANTES'
        };
        if (esHoraProgramada && horarioEntregaDate) {
            response.horarioEntrega = horarioEntregaDate.toISOString();
        }
        res.status(201).json(response);
    } catch (error) {
        await connection.rollback();
        console.error('❌ Error al crear pedido desde carta:', error);
        res.status(500).json({
            success: false,
            message: 'Error al crear el pedido',
            error: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    } finally {
        connection.release();
    }
};

module.exports = {
    crearPedidoCarta
};
