const db = require('../controllers/dbPromise');
const KitchenCapacityService = require('./KitchenCapacityService');
const TimeCalculationService = require('./TimeCalculationService');
const TimeLearningService = require('./TimeLearningService');

// Variable global para acceso a io desde el worker
let globalIo = null;
const setGlobalIo = (io) => { globalIo = io; };
const getGlobalIo = () => globalIo;

/**
 * Motor de reglas para gestionar la cola de pedidos automáticamente
 */
class OrderQueueEngine {
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
            
            // 2. Obtener pedidos RECIBIDOS pendientes del día actual, ordenados por prioridad y fecha
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
                    `SELECT id, horario_entrega, tiempo_estimado_preparacion, prioridad, transicion_automatica
                     FROM pedidos 
                     WHERE estado = 'RECIBIDO' 
                       AND transicion_automatica = TRUE
                       AND DATE(fecha) = CURDATE()
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
                    // Verificar si es pedido programado y si ya es hora
                    if (pedido.horario_entrega) {
                        const debeIniciar = await TimeCalculationService.verificarSiDebeIniciarPreparacion(pedido.id);
                        if (!debeIniciar) {
                            console.log(`⏰ [OrderQueueEngine] Pedido #${pedido.id} programado, aún no es hora de iniciar`);
                            continue;
                        }
                    }
                    
                    // Mover a EN_PREPARACION
                    await this.moverPedidoAPreparacion(connection, pedido.id, pedido.tiempo_estimado_preparacion);
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
                        const [pedidoActualizado] = await db.execute('SELECT * FROM pedidos WHERE id = ?', [pedido.id]);
                        if (pedidoActualizado.length > 0) {
                            socketService.emitPedidoEstadoCambiado(pedido.id, 'RECIBIDO', 'EN_PREPARACION', pedidoActualizado[0]);
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
    static async moverPedidoAPreparacion(connection, pedidoId, tiempoEstimado = null) {
        try {
            const ahora = new Date();
            
            // Obtener tiempo estimado si no se proporciona
            if (!tiempoEstimado) {
                tiempoEstimado = await TimeCalculationService.obtenerTiempoEstimado(pedidoId);
            }
            
            // Calcular hora_esperada_finalizacion
            const horaEsperadaFinalizacion = TimeCalculationService.calcularHoraEsperadaFinalizacion(
                ahora,
                tiempoEstimado
            );
            
            // Actualizar pedido
            await connection.execute(
                `UPDATE pedidos 
                 SET estado = 'EN_PREPARACION',
                     hora_inicio_preparacion = ?,
                     hora_esperada_finalizacion = ?
                 WHERE id = ?`,
                [ahora, horaEsperadaFinalizacion, pedidoId]
            );
            
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

