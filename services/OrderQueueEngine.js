const db = require('../controllers/dbPromise');
const KitchenCapacityService = require('./KitchenCapacityService');
const TimeCalculationService = require('./TimeCalculationService');
const TimeLearningService = require('./TimeLearningService');
const {
    pedidoEstaHabilitadoOperativamente,
    SQL_AND_PEDIDO_HABILITADO_OPERATIVAMENTE
} = require('./pedidoOperativoHelper');
const { buildPedidoSnapshotById } = require('./pedidoRealtimeSerializer');

// Variable global para acceso a io desde el worker
let globalIo = null;
const setGlobalIo = (io) => { globalIo = io; };
const getGlobalIo = () => globalIo;

/**
 * Motor de reglas para gestionar la cola de pedidos automáticamente
 */
class OrderQueueEngine {
    static DIGITAL_WEB_PAYMENT_METHODS = new Set(['TRANSFERENCIA', 'MERCADOPAGO']);

    static normalizarMedioPago(medioPago) {
        return String(medioPago || '').trim().toUpperCase();
    }

    static esPedidoWebPagoDigital(pedido) {
        if (!pedido) return false;
        const origen = String(pedido.origen_pedido || '').trim().toUpperCase();
        const medioPago = this.normalizarMedioPago(pedido.medio_pago);
        return origen === 'WEB' && this.DIGITAL_WEB_PAYMENT_METHODS.has(medioPago);
    }

    static esPedidoWebPagoDigitalPendiente(pedido) {
        if (!this.esPedidoWebPagoDigital(pedido)) return false;
        return !pedidoEstaHabilitadoOperativamente(pedido);
    }

    /**
     * Cuando un pedido WEB con pago digital pasa a PAGADO,
     * vuelve a evaluar la cola para que ingrese al flujo normal si corresponde.
     */
    static async activarFlujoSiCorrespondeTrasPago(pedidoId) {
        const [rows] = await db.execute(
            'SELECT id, estado, origen_pedido, medio_pago, estado_pago FROM pedidos WHERE id = ?',
            [pedidoId]
        );

        if (rows.length === 0) {
            return { activado: false, reason: 'pedido_no_encontrado' };
        }

        const pedido = rows[0];
        const estado = String(pedido.estado || '').trim().toUpperCase();
        const estadoPago = String(pedido.estado_pago || '').trim().toUpperCase();

        if (!this.esPedidoWebPagoDigital(pedido)) {
            return { activado: false, reason: 'no_es_web_pago_digital' };
        }
        if (estadoPago !== 'PAGADO') {
            return { activado: false, reason: 'aun_no_pagado' };
        }
        if (!['RECIBIDO', 'PROGRAMADO'].includes(estado)) {
            return { activado: false, reason: `estado_no_elegible_${estado || 'desconocido'}` };
        }

        const resultado = await this.evaluarColaPedidos();
        return { activado: true, resultado };
    }

    /**
     * Evaluar cola y mover pedidos de RECIBIDO a EN_PREPARACION si hay capacidad
     */
    static async evaluarColaPedidos() {
        try {
            console.log('🔄 [OrderQueueEngine] Evaluando cola de pedidos...');
            
            // 1. Obtener información de capacidad
            const infoCapacidad = await KitchenCapacityService.obtenerInfoCapacidad();
            
            if (infoCapacidad.estaLlena) {
                console.log(`⚠️ [OrderQueueEngine] Cocina al máximo (${infoCapacidad.pedidosEnPreparacion}/${infoCapacidad.capacidadMaxima})`);
                return { procesados: 0, mensaje: 'Cocina al máximo' };
            }
            
            const espaciosDisponibles = infoCapacidad.espaciosDisponibles;
            console.log(`✅ [OrderQueueEngine] ${espaciosDisponibles} espacio(s) disponible(s)`);
            
            // 2. Auditoría rápida de candidatos vs pedidos excluidos por transición manual
            try {
                const [stats] = await db.execute(
                    `SELECT 
                        COUNT(*) AS total_pendientes,
                        SUM(CASE WHEN transicion_automatica = TRUE THEN 1 ELSE 0 END) AS pendientes_automaticos,
                        SUM(CASE WHEN transicion_automatica = FALSE THEN 1 ELSE 0 END) AS pendientes_manuales
                     FROM pedidos
                     WHERE DATE(fecha) = CURDATE()
                       AND estado IN ('RECIBIDO', 'PROGRAMADO', 'programado')
                       ${SQL_AND_PEDIDO_HABILITADO_OPERATIVAMENTE}`
                );
                const row = stats[0] || {};
                console.log(
                    `ℹ️ [OrderQueueEngine] Pendientes hoy (RECIBIDO/PROGRAMADO): ` +
                    `${row.total_pendientes || 0} total | ` +
                    `${row.pendientes_automaticos || 0} automáticos (transicion_automatica=TRUE) | ` +
                    `${row.pendientes_manuales || 0} excluidos por transición manual (transicion_automatica=FALSE)`
                );
            } catch (statsError) {
                console.warn('⚠️ [OrderQueueEngine] No se pudo obtener estadísticas de pendientes:', statsError.message);
            }
            
            // 3. Obtener pedidos RECIBIDOS/PROGRAMADOS pendientes del día actual, ordenados por prioridad y fecha
            // Prioridad: ALTA primero, luego NORMAL
            // Dentro de cada prioridad, más antiguos primero
            // Solo considerar pedidos del día actual para mantener limpieza del sistema
            // IMPORTANTE: MySQL no acepta parámetros preparados en LIMIT, así que lo construimos directamente
            // Es seguro porque ya validamos que espaciosDisponibles es un número
            const limitValue = Math.max(1, parseInt(espaciosDisponibles, 10) || 10); // Default 10 si hay algún problema
            
            // Obtener conexión para transacción con SELECT FOR UPDATE
            // SELECT FOR UPDATE bloquea las filas seleccionadas hasta que termine la transacción
            // Esto previene race conditions: si dos ejecuciones del worker corren simultáneamente,
            // solo una podrá procesar cada pedido. La otra esperará hasta que se haga commit o rollback.
            const connection = await db.getConnection();
            
            try {
                await connection.beginTransaction();
                
                const [pedidosPendientes] = await connection.execute(
                    `SELECT 
                        id,
                        estado,
                        horario_entrega,
                        tiempo_estimado_preparacion,
                        prioridad,
                        transicion_automatica,
                        CASE
                          WHEN horario_entrega IS NOT NULL AND tiempo_estimado_preparacion > 0
                            THEN DATE_SUB(horario_entrega, INTERVAL tiempo_estimado_preparacion MINUTE)
                          ELSE NULL
                        END AS inicio_preparacion_calculado
                     FROM pedidos 
                     WHERE estado IN ('RECIBIDO', 'PROGRAMADO', 'programado')
                       AND transicion_automatica = TRUE -- Solo pedidos gestionados por el flujo automático (excluye adelantados manualmente)
                       AND DATE(fecha) = CURDATE()
                       ${SQL_AND_PEDIDO_HABILITADO_OPERATIVAMENTE}
                       AND (
                            -- Pedidos "cuanto antes": procesar cuando haya capacidad
                            horario_entrega IS NULL
                            OR
                            -- Pedidos programados: iniciar según tiempo_estimado_preparacion del pedido
                            (
                                horario_entrega IS NOT NULL
                                AND tiempo_estimado_preparacion > 0
                                AND NOW() >= DATE_SUB(horario_entrega, INTERVAL tiempo_estimado_preparacion MINUTE)
                            )
                       )
                     ORDER BY 
                       CASE prioridad 
                         WHEN 'ALTA' THEN 1 
                         WHEN 'NORMAL' THEN 2 
                         ELSE 3 
                       END ASC,
                       fecha ASC
                     LIMIT ${limitValue}
                     FOR UPDATE`
                );
            
                if (pedidosPendientes.length === 0) {
                    await connection.rollback();
                    connection.release();
                    console.log('ℹ️ [OrderQueueEngine] No hay pedidos pendientes');
                    return { procesados: 0, mensaje: 'No hay pedidos pendientes' };
                }
                
                console.log(`📦 [OrderQueueEngine] ${pedidosPendientes.length} pedido(s) pendiente(s) encontrado(s)`);
                
                // 3. Procesar cada pedido (ya estamos dentro de la transacción)
                let procesados = 0;
                
                for (const pedido of pedidosPendientes) {
                    if (pedido.horario_entrega) {
                        // Log temporal para auditar transición automática de programados.
                        // La comparación ya se resolvió en SQL para evitar múltiples queries por pedido.
                        console.log(
                            `⏰ [OrderQueueEngine] Pedido #${pedido.id} movido automáticamente` +
                            ` | hora_entrega=${new Date(pedido.horario_entrega).toISOString()}` +
                            ` | tiempo_estimado=${pedido.tiempo_estimado_preparacion}min` +
                            ` | inicio_calculado=${pedido.inicio_preparacion_calculado ? new Date(pedido.inicio_preparacion_calculado).toISOString() : 'N/A'}`
                        );
                    }

                    // Mover a EN_PREPARACION
                    await this.moverPedidoAPreparacion(connection, pedido.id);
                    procesados++;
                    
                    // Verificar si ya llenamos la capacidad
                    if (procesados >= espaciosDisponibles) {
                        break;
                    }
                }
                
                await connection.commit();
                console.log(`✅ [OrderQueueEngine] ${procesados} pedido(s) movido(s) a EN_PREPARACION`);
                
                // Emitir eventos WebSocket para pedidos procesados (después del commit)
                if (procesados > 0 && getGlobalIo()) {
                    const { getInstance: getSocketService } = require('./SocketService');
                    const socketService = getSocketService(getGlobalIo());
                    
                    // Obtener pedidos actualizados para emitir eventos
                    // Nota: Usamos db.execute directamente ya que la transacción se cerró
                    for (const pedido of pedidosPendientes.slice(0, procesados)) {
                        const pedidoActualizado = await buildPedidoSnapshotById({
                            pedidoId: pedido.id,
                            connection: db,
                            includeArticulos: true
                        });
                        if (pedidoActualizado) {
                            socketService.emitPedidoEstadoCambiado(
                                pedido.id,
                                pedido.estado || 'RECIBIDO',
                                'EN_PREPARACION',
                                pedidoActualizado
                            );
                        }
                    }
                    
                    // Emitir actualización de capacidad
                    const infoCapacidadActualizada = await KitchenCapacityService.obtenerInfoCapacidad();
                    socketService.emitCapacidadActualizada(infoCapacidadActualizada);
                }
                
                return { procesados, mensaje: `${procesados} pedidos procesados` };
                
            } catch (error) {
                await connection.rollback();
                throw error;
            } finally {
                connection.release();
            }
            
        } catch (error) {
            console.error('❌ [OrderQueueEngine] Error evaluando cola:', error);
            return { procesados: 0, error: error.message };
        }
    }

    /**
     * Mover pedido a EN_PREPARACION con timestamps
     */
    static async moverPedidoAPreparacion(connection, pedidoId) {
        try {
            const [pedidoGate] = await connection.execute(
                'SELECT medio_pago, estado_pago, origen_pedido FROM pedidos WHERE id = ?',
                [pedidoId]
            );
            if (pedidoGate.length === 0) {
                throw new Error(`Pedido #${pedidoId} no encontrado`);
            }
            if (!pedidoEstaHabilitadoOperativamente(pedidoGate[0])) {
                throw new Error(`Pedido #${pedidoId} no habilitado para cocina (pago pendiente)`);
            }

            const ahora = new Date();

            // Calcular tiempo dinámico al momento de entrar a EN_PREPARACION.
            // Se ejecuta dentro de la misma transacción para mantener consistencia.
            const tiempoEstimado = await TimeCalculationService.calcularTiempoEstimadoPedido(pedidoId, { connection });
            
            // Calcular hora_esperada_finalizacion
            const horaEsperadaFinalizacion = TimeCalculationService.calcularHoraEsperadaFinalizacion(
                ahora,
                tiempoEstimado
            );
            
            // Actualizar pedido
            const [updateResult] = await connection.execute(
                `UPDATE pedidos 
                 SET estado = 'EN_PREPARACION',
                     hora_inicio_preparacion = ?,
                     tiempo_estimado_preparacion = ?,
                     hora_esperada_finalizacion = ?,
                     fecha_modificacion = NOW()
                 WHERE id = ?
                   AND estado IN ('RECIBIDO', 'PROGRAMADO', 'programado')`,
                [ahora, tiempoEstimado, horaEsperadaFinalizacion, pedidoId]
            );

            if (!updateResult || updateResult.affectedRows === 0) {
                console.log(`ℹ️ [OrderQueueEngine] Pedido #${pedidoId} no se movió (estado cambió antes de aplicar worker)`);
                return;
            }
            
            console.log(`✅ [OrderQueueEngine] Pedido #${pedidoId} movido a EN_PREPARACION (esperado listo: ${horaEsperadaFinalizacion.toLocaleString()})`);
            
            // Crear comanda automáticamente (similar a pedidosController)
            await this.crearComandaAutomatica(connection, pedidoId);
            
        } catch (error) {
            console.error(`❌ [OrderQueueEngine] Error moviendo pedido #${pedidoId} a preparación:`, error);
            throw error;
        }
    }

    /**
     * Crear comanda automáticamente cuando un pedido entra a EN_PREPARACION
     */
    static async crearComandaAutomatica(connection, pedidoId) {
        try {
            // Verificar si ya existe comanda
            const [comandasExistentes] = await connection.execute(
                'SELECT id FROM comandas WHERE pedido_id = ?',
                [pedidoId]
            );
            
            if (comandasExistentes.length > 0) {
                return; // Ya existe comanda
            }
            
            // Obtener datos del pedido
            const [pedidoData] = await connection.execute(
                'SELECT * FROM pedidos WHERE id = ?',
                [pedidoId]
            );
            
            if (pedidoData.length === 0) return;
            
            const pedido = pedidoData[0];
            
            // Obtener artículos
            const [articulosPedido] = await connection.execute(
                'SELECT * FROM pedidos_contenido WHERE pedido_id = ?',
                [pedidoId]
            );
            
            // Crear comanda
            // NOTA: La comanda no maneja estado propio, depende del pedido (pedidos.estado)
            const [comandaResult] = await connection.execute(
                `INSERT INTO comandas (
                    pedido_id, fecha, cliente_nombre, cliente_direccion, cliente_telefono, cliente_email,
                    modalidad, horario_entrega, observaciones, usuario_id, usuario_nombre
                ) VALUES (?, NOW(), ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                [
                    pedido.id,
                    pedido.cliente_nombre,
                    pedido.cliente_direccion,
                    pedido.cliente_telefono,
                    pedido.cliente_email,
                    pedido.modalidad,
                    pedido.horario_entrega,
                    pedido.observaciones,
                    null, // Sistema automático
                    'SISTEMA'
                ]
            );
            
            const comandaId = comandaResult.insertId;
            
            // Insertar artículos en comandas_contenido
            for (const articulo of articulosPedido) {
                let personalizaciones = null;
                if (articulo.personalizaciones) {
                    try {
                        personalizaciones = typeof articulo.personalizaciones === 'string'
                            ? articulo.personalizaciones
                            : JSON.stringify(articulo.personalizaciones);
                    } catch (e) {
                        personalizaciones = null;
                    }
                }
                
                await connection.execute(
                    `INSERT INTO comandas_contenido (
                        comanda_id, articulo_id, articulo_nombre, cantidad, personalizaciones, observaciones
                    ) VALUES (?, ?, ?, ?, ?, ?)`,
                    [
                        comandaId,
                        articulo.articulo_id,
                        articulo.articulo_nombre,
                        articulo.cantidad,
                        personalizaciones,
                        articulo.observaciones
                    ]
                );
            }
            
            console.log(`✅ [OrderQueueEngine] Comanda #${comandaId} creada automáticamente para pedido #${pedidoId}`);
            
        } catch (error) {
            console.error(`❌ [OrderQueueEngine] Error creando comanda para pedido #${pedidoId}:`, error);
            // No lanzar error, la comanda es secundaria
        }
    }

    /**
     * Detectar y registrar pedidos atrasados
     */
    static async detectarPedidosAtrasados() {
        try {
            const pedidosAtrasados = await TimeCalculationService.obtenerPedidosAtrasados();
            
            if (pedidosAtrasados.length > 0) {
                console.log(`⚠️ [OrderQueueEngine] ${pedidosAtrasados.length} pedido(s) atrasado(s):`, 
                    pedidosAtrasados.map(p => `#${p.id}`).join(', '));
                
                // Emitir evento WebSocket para pedidos atrasados
                if (getGlobalIo()) {
                    const { getInstance: getSocketService } = require('./SocketService');
                    const socketService = getSocketService(getGlobalIo());
                    socketService.emitPedidosAtrasados(pedidosAtrasados);
                }
            }
            
            return pedidosAtrasados;
        } catch (error) {
            console.error('❌ [OrderQueueEngine] Error detectando pedidos atrasados:', error);
            return [];
        }
    }
}

module.exports = { OrderQueueEngine, setGlobalIo, getGlobalIo };

