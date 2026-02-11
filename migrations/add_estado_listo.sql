-- Migración: Agregar estado LISTO como estado intermedio real
-- Fecha: 2025-01-XX
-- Descripción: Agrega LISTO entre EN_PREPARACION y ENTREGADO, y campo hora_listo

-- 1. Actualizar enum de estado en tabla pedidos para incluir LISTO
-- IMPORTANTE: El orden debe ser: RECIBIDO, EN_PREPARACION, LISTO, ENTREGADO, CANCELADO
ALTER TABLE pedidos 
  MODIFY COLUMN estado ENUM('RECIBIDO','EN_PREPARACION','LISTO','ENTREGADO','CANCELADO') 
  NOT NULL DEFAULT 'RECIBIDO';

-- 2. Agregar campo hora_listo para registrar cuando el pedido pasa a LISTO
ALTER TABLE pedidos
  ADD COLUMN hora_listo TIMESTAMP NULL DEFAULT NULL
    COMMENT 'Timestamp cuando el pedido pasa a estado LISTO'
  AFTER hora_esperada_finalizacion;

-- 3. Agregar índice para búsquedas por hora_listo
ALTER TABLE pedidos
  ADD INDEX idx_hora_listo (hora_listo);

-- 4. Agregar índice compuesto para consultas de pedidos LISTO del día
ALTER TABLE pedidos
  ADD INDEX idx_estado_hora_listo (estado, hora_listo);




