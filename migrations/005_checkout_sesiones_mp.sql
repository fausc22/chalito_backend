-- Sesiones de checkout Mercado Pago: el pedido se crea solo tras pago aprobado.
-- Ejecutar en la base de datos de producción antes de desplegar el nuevo flujo.

CREATE TABLE IF NOT EXISTS `checkout_sesiones_mp` (
  `id` char(36) NOT NULL,
  `fecha` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `fecha_expiracion` timestamp NOT NULL,
  `estado` enum('PENDIENTE','PROCESADO','CANCELADO','EXPIRADO') NOT NULL DEFAULT 'PENDIENTE',
  `pedido_id` int DEFAULT NULL,
  `id_preferencia` varchar(120) DEFAULT NULL,
  `id_pago` varchar(120) DEFAULT NULL,
  `referencia_externa` varchar(120) NOT NULL,
  `payload_checkout` json NOT NULL,
  `estado_mp` varchar(50) DEFAULT NULL,
  `fecha_modificacion` timestamp NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_referencia` (`referencia_externa`),
  KEY `idx_estado` (`estado`),
  KEY `idx_fecha_expiracion` (`fecha_expiracion`),
  KEY `idx_pedido_id` (`pedido_id`),
  CONSTRAINT `fk_checkout_sesion_pedido` FOREIGN KEY (`pedido_id`) REFERENCES `pedidos` (`id`) ON DELETE SET NULL ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
