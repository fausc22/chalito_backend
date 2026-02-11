-- =====================================================
-- ÍNDICES PARA OPTIMIZAR QUERIES DEL MÓDULO DE PEDIDOS
-- =====================================================
-- 
-- Este archivo contiene índices propuestos para mejorar
-- el rendimiento de las queries más frecuentes del sistema.
--
-- IMPORTANTE: Revisar índices existentes antes de ejecutar.
-- Usar: SHOW INDEX FROM pedidos;
--
-- =====================================================

-- -----------------------------------------------------
-- ÍNDICE 1: (fecha, estado)
-- -----------------------------------------------------
-- OPTIMIZA:
-- - OrderQueueEngine.evaluarColaPedidos: WHERE estado = 'RECIBIDO' AND DATE(fecha) = CURDATE()
-- - Queries de filtrado por fecha y estado
-- - Reportes de pedidos por día/estado
--
-- IMPACTO: Alto - Query ejecutada cada 30 segundos por el worker
-- -----------------------------------------------------
CREATE INDEX idx_pedidos_fecha_estado ON pedidos (fecha, estado);

-- -----------------------------------------------------
-- ÍNDICE 2: (estado, prioridad, fecha)
-- -----------------------------------------------------
-- OPTIMIZA:
-- - OrderQueueEngine.evaluarColaPedidos: ORDER BY prioridad, fecha
-- - Queries que filtran por estado y ordenan por prioridad
-- - Mejora el ordenamiento en la cola de pedidos
--
-- IMPACTO: Alto - Usado en cada evaluación de cola
-- -----------------------------------------------------
CREATE INDEX idx_pedidos_estado_prioridad_fecha ON pedidos (estado, prioridad, fecha);

-- -----------------------------------------------------
-- ÍNDICE 3: hora_esperada_finalizacion
-- -----------------------------------------------------
-- OPTIMIZA:
-- - TimeCalculationService.obtenerPedidosAtrasados: WHERE hora_esperada_finalizacion < NOW()
-- - Detección de pedidos atrasados (ejecutada cada 30 segundos)
-- - Query de métricas de pedidos atrasados
--
-- IMPACTO: Medio-Alto - Query ejecutada frecuentemente
-- -----------------------------------------------------
CREATE INDEX idx_pedidos_hora_esperada_finalizacion ON pedidos (hora_esperada_finalizacion);

-- -----------------------------------------------------
-- ÍNDICE 4: (estado, hora_esperada_finalizacion, fecha)
-- -----------------------------------------------------
-- OPTIMIZA:
-- - TimeCalculationService.obtenerPedidosAtrasados con filtro de estado y fecha
-- - Queries combinadas que buscan pedidos atrasados de un día específico
-- - Mejora el rendimiento cuando hay muchos pedidos históricos
--
-- IMPACTO: Medio - Mejora queries de detección de atrasos
-- -----------------------------------------------------
CREATE INDEX idx_pedidos_estado_hora_fecha ON pedidos (estado, hora_esperada_finalizacion, fecha);

-- -----------------------------------------------------
-- ÍNDICE 5: hora_inicio_preparacion
-- -----------------------------------------------------
-- OPTIMIZA:
-- - Queries que filtran por hora_inicio_preparacion
-- - Cálculos de tiempo transcurrido
-- - Reportes de tiempo de preparación
--
-- IMPACTO: Medio - Usado en cálculos y reportes
-- -----------------------------------------------------
CREATE INDEX idx_pedidos_hora_inicio_preparacion ON pedidos (hora_inicio_preparacion);

-- -----------------------------------------------------
-- VERIFICACIÓN POST-CREACIÓN
-- -----------------------------------------------------
-- Ejecutar después de crear los índices para verificar:
-- SHOW INDEX FROM pedidos;
-- 
-- Para analizar el uso de índices en una query específica:
-- EXPLAIN SELECT ... FROM pedidos WHERE ...;
-- -----------------------------------------------------




