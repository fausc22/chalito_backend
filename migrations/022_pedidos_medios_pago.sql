-- Migracion: 022_pedidos_medios_pago.sql
-- Modulo: PEDIDOS
CREATE TABLE IF NOT EXISTS pedidos_medios_pago (
  id           INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
  pedido_id    INT NOT NULL,
  medio_pago   VARCHAR(50) NOT NULL,
  monto        DECIMAL(10,2) NOT NULL,
  orden        TINYINT UNSIGNED NOT NULL DEFAULT 1,
  created_at   TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_pmp_pedido_id (pedido_id),
  CONSTRAINT fk_pmp_pedido FOREIGN KEY (pedido_id)
    REFERENCES pedidos(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
