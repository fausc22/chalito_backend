-- Agregar campo estado_pago a la tabla pedidos
ALTER TABLE `pedidos` 
ADD COLUMN `estado_pago` ENUM('DEBE', 'PAGADO') NOT NULL DEFAULT 'DEBE' 
AFTER `medio_pago`;

-- Crear índice para mejorar consultas por estado de pago
CREATE INDEX `idx_estado_pago` ON `pedidos` (`estado_pago`);















