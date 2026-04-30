CREATE TABLE IF NOT EXISTS clientes (
  id INT NOT NULL AUTO_INCREMENT,
  nombre VARCHAR(150) NOT NULL,
  nombre_norm VARCHAR(150) NOT NULL COMMENT 'lowercase sin tildes para busqueda',
  telefono VARCHAR(50) NOT NULL,
  email VARCHAR(100) DEFAULT NULL,
  activo TINYINT(1) NOT NULL DEFAULT 1,
  created_at TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_clientes_telefono (telefono),
  KEY idx_clientes_nombre_norm (nombre_norm),
  KEY idx_clientes_email (email),
  KEY idx_clientes_activo (activo)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS clientes_direcciones (
  id INT NOT NULL AUTO_INCREMENT,
  cliente_id INT NOT NULL,
  direccion VARCHAR(255) NOT NULL,
  alias VARCHAR(100) DEFAULT NULL,
  ultima_vez TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP,
  created_at TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_clientes_direcciones_cliente_id (cliente_id),
  KEY idx_clientes_direcciones_ultima_vez (ultima_vez),
  CONSTRAINT fk_clientes_direcciones_cliente
    FOREIGN KEY (cliente_id) REFERENCES clientes(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

SET @has_cliente_id_pedidos := (
  SELECT COUNT(*)
  FROM INFORMATION_SCHEMA.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'pedidos'
    AND COLUMN_NAME = 'cliente_id'
);

SET @sql_add_cliente_id_pedidos := IF(
  @has_cliente_id_pedidos = 0,
  'ALTER TABLE pedidos ADD COLUMN cliente_id INT NULL AFTER id',
  'SELECT 1'
);
PREPARE stmt_add_cliente_id_pedidos FROM @sql_add_cliente_id_pedidos;
EXECUTE stmt_add_cliente_id_pedidos;
DEALLOCATE PREPARE stmt_add_cliente_id_pedidos;

SET @has_fk_pedidos_clientes := (
  SELECT COUNT(*)
  FROM INFORMATION_SCHEMA.REFERENTIAL_CONSTRAINTS
  WHERE CONSTRAINT_SCHEMA = DATABASE()
    AND CONSTRAINT_NAME = 'fk_pedidos_cliente'
    AND TABLE_NAME = 'pedidos'
);

SET @sql_add_fk_pedidos_clientes := IF(
  @has_fk_pedidos_clientes = 0,
  'ALTER TABLE pedidos ADD CONSTRAINT fk_pedidos_cliente FOREIGN KEY (cliente_id) REFERENCES clientes(id) ON DELETE SET NULL',
  'SELECT 1'
);
PREPARE stmt_add_fk_pedidos_clientes FROM @sql_add_fk_pedidos_clientes;
EXECUTE stmt_add_fk_pedidos_clientes;
DEALLOCATE PREPARE stmt_add_fk_pedidos_clientes;

SET @has_idx_pedidos_cliente_id := (
  SELECT COUNT(*)
  FROM INFORMATION_SCHEMA.STATISTICS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'pedidos'
    AND INDEX_NAME = 'idx_pedidos_cliente_id'
);

SET @sql_add_idx_pedidos_cliente_id := IF(
  @has_idx_pedidos_cliente_id = 0,
  'ALTER TABLE pedidos ADD KEY idx_pedidos_cliente_id (cliente_id)',
  'SELECT 1'
);
PREPARE stmt_add_idx_pedidos_cliente_id FROM @sql_add_idx_pedidos_cliente_id;
EXECUTE stmt_add_idx_pedidos_cliente_id;
DEALLOCATE PREPARE stmt_add_idx_pedidos_cliente_id;

SET @has_cliente_id_ventas := (
  SELECT COUNT(*)
  FROM INFORMATION_SCHEMA.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'ventas'
    AND COLUMN_NAME = 'cliente_id'
);

SET @sql_add_cliente_id_ventas := IF(
  @has_cliente_id_ventas = 0,
  'ALTER TABLE ventas ADD COLUMN cliente_id INT NULL AFTER pedido_id',
  'SELECT 1'
);
PREPARE stmt_add_cliente_id_ventas FROM @sql_add_cliente_id_ventas;
EXECUTE stmt_add_cliente_id_ventas;
DEALLOCATE PREPARE stmt_add_cliente_id_ventas;

SET @has_fk_ventas_clientes := (
  SELECT COUNT(*)
  FROM INFORMATION_SCHEMA.REFERENTIAL_CONSTRAINTS
  WHERE CONSTRAINT_SCHEMA = DATABASE()
    AND CONSTRAINT_NAME = 'fk_ventas_cliente'
    AND TABLE_NAME = 'ventas'
);

SET @sql_add_fk_ventas_clientes := IF(
  @has_fk_ventas_clientes = 0,
  'ALTER TABLE ventas ADD CONSTRAINT fk_ventas_cliente FOREIGN KEY (cliente_id) REFERENCES clientes(id) ON DELETE SET NULL',
  'SELECT 1'
);
PREPARE stmt_add_fk_ventas_clientes FROM @sql_add_fk_ventas_clientes;
EXECUTE stmt_add_fk_ventas_clientes;
DEALLOCATE PREPARE stmt_add_fk_ventas_clientes;

SET @has_idx_ventas_cliente_id := (
  SELECT COUNT(*)
  FROM INFORMATION_SCHEMA.STATISTICS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'ventas'
    AND INDEX_NAME = 'idx_ventas_cliente_id'
);

SET @sql_add_idx_ventas_cliente_id := IF(
  @has_idx_ventas_cliente_id = 0,
  'ALTER TABLE ventas ADD KEY idx_ventas_cliente_id (cliente_id)',
  'SELECT 1'
);
PREPARE stmt_add_idx_ventas_cliente_id FROM @sql_add_idx_ventas_cliente_id;
EXECUTE stmt_add_idx_ventas_cliente_id;
DEALLOCATE PREPARE stmt_add_idx_ventas_cliente_id;
