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
const { validarExtrasNoDobleYTriple, construirPersonalizaciones } = require('../services/PersonalizacionesService');
const { parseScheduledTime } = require('../services/ScheduledTimeParser');
const { isStoreOpen, isValidScheduledDateTime, getNowInStoreTimezone } = require('../services/storeScheduleService');
const { isStoreHoursValidationEnabled } = require('../config/storeHoursConfig');
const { enrichPedidoRealtime, buildPedidoSnapshotById } = require('../services/pedidoRealtimeSerializer');
const { calcularTotalesDesdePrecioFinal } = require('../services/totalesPrecioFinal');

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

        // Validación de horarios de atención (backend es fuente de verdad)
        // Permite bypass global mediante ENABLE_STORE_HOURS_VALIDATION=false
        if (isStoreHoursValidationEnabled()) {
            if (esHoraProgramada) {
                if (!horarioEntregaDate) {
                    return res.status(400).json({
                        success: false,
                        message: 'Debés indicar un horario programado válido.'
                    });
                }
                if (!isValidScheduledDateTime(horarioEntregaDate)) {
                    return res.status(400).json({
                        success: false,
                        message: 'El horario programado está fuera del horario de atención.'
                    });
                }
            } else {
                const now = getNowInStoreTimezone();
                if (!isStoreOpen(now)) {
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

        const articulosNormalizados = [];

        for (const item of items) {
            const productId = item.productId;
            const quantity = item.quantity;
            const selectedExtras = Array.isArray(item.selectedExtras) ? item.selectedExtras : [];

            // 1. Validar artículo existe y traer precio
            const [articuloRows] = await connection.execute(
                'SELECT id, nombre, precio FROM articulos WHERE id = ? AND activo = 1',
                [productId]
            );

            if (articuloRows.length === 0) {
                await connection.rollback();
                return res.status(400).json({
                    success: false,
                    message: `Producto no encontrado o no disponible: ${productId}`
                });
            }

            const articulo = articuloRows[0];
            const precioBase = parseFloat(articulo.precio) || 0;

            // 2. Validar y traer adicionales seleccionados (que pertenezcan al artículo)
            let extrasSnapshot = [];
            let extrasTotal = 0;

            if (selectedExtras.length > 0) {
                const placeholders = selectedExtras.map(() => '?').join(',');
                const [adicionalesRows] = await connection.execute(
                    `SELECT a.id, a.nombre, a.precio_extra
                     FROM adicionales a
                     INNER JOIN adicionales_contenido ac ON a.id = ac.adicional_id AND ac.articulo_id = ?
                     WHERE a.id IN (${placeholders}) AND a.disponible = 1`,
                    [productId, ...selectedExtras]
                );

                if (adicionalesRows.length !== selectedExtras.length) {
                    await connection.rollback();
                    return res.status(400).json({
                        success: false,
                        message: `Uno o más adicionales no son válidos para el artículo ${articulo.nombre} (productId: ${productId})`
                    });
                }

                extrasSnapshot = adicionalesRows.map(a => ({
                    id: a.id,
                    nombre: a.nombre,
                    precio_extra: parseFloat(a.precio_extra) || 0
                }));

                const validacion = validarExtrasNoDobleYTriple(extrasSnapshot);
                if (!validacion.valid) {
                    await connection.rollback();
                    return res.status(400).json({
                        success: false,
                        message: validacion.message,
                        code: 'EXTRAS_DOBLE_TRIPLE_INCOMPATIBLES'
                    });
                }

                extrasTotal = extrasSnapshot.reduce((sum, e) => sum + e.precio_extra, 0);
            }

            const precioUnitario = precioBase + extrasTotal;
            const subtotal = precioUnitario * quantity;

            const personalizaciones = construirPersonalizaciones(extrasSnapshot);

            articulosNormalizados.push({
                articulo_id: articulo.id,
                articulo_nombre: articulo.nombre,
                cantidad: quantity,
                precio: precioUnitario,
                subtotal,
                personalizaciones: extrasSnapshot.length > 0 ? personalizaciones : null,
                observaciones: item.itemNotes || null
            });
        }

        const totalBase = articulosNormalizados.reduce((sum, a) => sum + a.subtotal, 0);
        const { subtotal: subtotalPedido, iva_total: ivaTotal, total } = calcularTotalesDesdePrecioFinal(totalBase);

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

        // Insert pedidos
        const pedidoQuery = `
            INSERT INTO pedidos (
                fecha, cliente_nombre, cliente_direccion, cliente_telefono, cliente_email,
                origen_pedido, subtotal, iva_total, total, medio_pago, estado_pago, modalidad, horario_entrega,
                estado, observaciones, monto_con_cuanto_abona, usuario_id, usuario_nombre,
                prioridad, tiempo_estimado_preparacion, hora_inicio_preparacion, transicion_automatica
            ) VALUES (NOW(), ?, ?, ?, ?, 'WEB', ?, ?, ?, ?, 'PENDIENTE', ?, ?, 'RECIBIDO', ?, ?, NULL, NULL, ?, ?, ?, ?)
        `;

        const pedidoValues = [
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
            true
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
                'UPDATE articulos SET stock_actual = stock_actual - ? WHERE id = ?',
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
