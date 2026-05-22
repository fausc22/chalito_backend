-- Fase 2: cupones tienda online

CREATE TABLE IF NOT EXISTS `cupones` (
  `id` int NOT NULL AUTO_INCREMENT,
  `codigo` varchar(64) COLLATE utf8mb4_unicode_ci NOT NULL,
  `tipo` enum('porcentaje', 'monto_fijo') COLLATE utf8mb4_unicode_ci NOT NULL,
  `valor` decimal(10,2) NOT NULL,
  `monto_minimo` decimal(10,2) NOT NULL DEFAULT '0.00',
  `usos_maximos` int NOT NULL DEFAULT '1',
  `usos_actuales` int NOT NULL DEFAULT '0',
  `fecha_inicio` datetime DEFAULT NULL,
  `fecha_fin` datetime DEFAULT NULL,
  `activo` tinyint(1) NOT NULL DEFAULT '1',
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_cupones_codigo` (`codigo`),
  KEY `idx_cupones_activo` (`activo`),
  KEY `idx_cupones_activo_codigo` (`activo`, `codigo`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `cupones_redenciones` (
  `id` int NOT NULL AUTO_INCREMENT,
  `cupon_id` int NOT NULL,
  `pedido_id` int NOT NULL,
  `monto_aplicado` decimal(10,2) NOT NULL DEFAULT '0.00',
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_cupones_redenciones_cupon_id` (`cupon_id`),
  KEY `idx_cupones_redenciones_pedido_id` (`pedido_id`),
  CONSTRAINT `fk_cupones_redenciones_cupon` FOREIGN KEY (`cupon_id`) REFERENCES `cupones` (`id`) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT `fk_cupones_redenciones_pedido` FOREIGN KEY (`pedido_id`) REFERENCES `pedidos` (`id`) ON DELETE RESTRICT ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Columnas en pedidos (idempotente)
SET @col_exists = (
  SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'pedidos' AND COLUMN_NAME = 'cupon_id'
);
SET @sql_cupon_id = IF(@col_exists = 0,
  'ALTER TABLE pedidos ADD COLUMN cupon_id INT NULL',
  'SELECT 1');
PREPARE stmt FROM @sql_cupon_id;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @col_exists = (
  SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'pedidos' AND COLUMN_NAME = 'cupon_codigo'
);
SET @sql_cupon_codigo = IF(@col_exists = 0,
  'ALTER TABLE pedidos ADD COLUMN cupon_codigo VARCHAR(64) NULL',
  'SELECT 1');
PREPARE stmt FROM @sql_cupon_codigo;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @col_exists = (
  SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'pedidos' AND COLUMN_NAME = 'descuento_cupon'
);
SET @sql_descuento = IF(@col_exists = 0,
  'ALTER TABLE pedidos ADD COLUMN descuento_cupon DECIMAL(10,2) NOT NULL DEFAULT 0',
  'SELECT 1');
PREPARE stmt FROM @sql_descuento;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;
