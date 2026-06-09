-- Cuentas de sistema X / ARCA y campos fiscales para ventas

ALTER TABLE cuentas_fondos
  ADD COLUMN es_sistema TINYINT(1) NOT NULL DEFAULT 0 AFTER activa;

ALTER TABLE ventas
  ADD COLUMN numero_factura VARCHAR(30) NULL AFTER tipo_factura,
  ADD COLUMN cae_estado ENUM('NO_APLICA','PENDIENTE','OK','ERROR','ERROR_PERMANENTE') NOT NULL DEFAULT 'NO_APLICA' AFTER cae_fecha,
  ADD COLUMN cae_resultado VARCHAR(5) NULL AFTER cae_estado,
  ADD COLUMN cae_mensaje_error VARCHAR(500) NULL AFTER cae_resultado,
  ADD COLUMN cae_solicitud_fecha TIMESTAMP NULL AFTER cae_mensaje_error,
  ADD COLUMN punto_venta INT NULL AFTER cae_solicitud_fecha;

CREATE TABLE IF NOT EXISTS arca_solicitudes_log (
  id INT NOT NULL AUTO_INCREMENT,
  venta_id INT NOT NULL,
  request_data JSON NULL,
  response_data JSON NULL,
  estado VARCHAR(20) NOT NULL DEFAULT 'EN_PROCESO',
  mensaje_error TEXT NULL,
  tiempo_respuesta INT NULL,
  created_at TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_arca_log_venta (venta_id),
  KEY idx_arca_log_estado (estado)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS control_numeracion_facturas (
  id INT NOT NULL AUTO_INCREMENT,
  punto_venta VARCHAR(4) NOT NULL,
  tipo_factura VARCHAR(1) NOT NULL,
  ultimo_numero INT NOT NULL DEFAULT 0,
  PRIMARY KEY (id),
  UNIQUE KEY uq_pv_tipo (punto_venta, tipo_factura)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- Consolidar cuenta legacy hacia X
UPDATE cuentas_fondos
SET nombre = 'X', es_sistema = 1, descripcion = 'Operaciones sin factura electrónica'
WHERE nombre LIKE '%Cuenta X%' OR nombre = 'Cuenta X FEDERICO';

INSERT INTO cuentas_fondos (nombre, descripcion, saldo, activa, es_sistema)
SELECT 'X', 'Operaciones sin factura electrónica', 0, 1, 1
FROM DUAL
WHERE NOT EXISTS (SELECT 1 FROM cuentas_fondos WHERE nombre = 'X' LIMIT 1);

INSERT INTO cuentas_fondos (nombre, descripcion, saldo, activa, es_sistema)
SELECT 'ARCA', 'Ingresos facturados electrónicamente', 0, 1, 1
FROM DUAL
WHERE NOT EXISTS (SELECT 1 FROM cuentas_fondos WHERE nombre = 'ARCA' LIMIT 1);

UPDATE cuentas_fondos SET es_sistema = 1 WHERE nombre IN ('X', 'ARCA');
