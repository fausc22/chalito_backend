-- Migración: Agregar pedido_id a ventas para asociación explícita
-- Fecha: 2025-02
-- Descripción: Permite vincular venta con pedido cuando se cobra desde pedido

ALTER TABLE ventas
  ADD COLUMN pedido_id INT NULL DEFAULT NULL
    COMMENT 'ID del pedido asociado (cuando la venta proviene de cobrar un pedido)'
  AFTER id;

ALTER TABLE ventas
  ADD INDEX idx_pedido_id (pedido_id);

-- Opcional: FK para integridad referencial (SET NULL al eliminar pedido para no perder historial de ventas)
ALTER TABLE ventas
  ADD CONSTRAINT ventas_pedido_fk 
  FOREIGN KEY (pedido_id) REFERENCES pedidos(id) ON DELETE SET NULL;
