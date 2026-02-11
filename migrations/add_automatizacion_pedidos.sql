-- Migración: Agregar campos para automatización de pedidos
-- Fecha: 2025-01-XX
-- Descripción: Agrega campos necesarios para el motor automático de transiciones

-- 1. Agregar campos a tabla pedidos
ALTER TABLE pedidos
  ADD COLUMN hora_inicio_preparacion TIMESTAMP NULL DEFAULT NULL
    COMMENT 'Timestamp cuando el pedido entra a EN_PREPARACION',
  ADD COLUMN tiempo_estimado_preparacion INT NOT NULL DEFAULT 15
    COMMENT 'Minutos estimados de preparación (default 15)',
  ADD COLUMN hora_esperada_finalizacion TIMESTAMP NULL DEFAULT NULL
    COMMENT 'Calculado: hora_inicio_preparacion + tiempo_estimado_preparacion',
  ADD COLUMN prioridad ENUM('NORMAL','ALTA') NOT NULL DEFAULT 'NORMAL'
    COMMENT 'ALTA para pedidos "cuanto antes", NORMAL para programados',
  ADD COLUMN transicion_automatica BOOLEAN NOT NULL DEFAULT TRUE
    COMMENT 'Si FALSE, requiere intervención manual';

-- 2. Agregar índices para performance
ALTER TABLE pedidos
  ADD INDEX idx_hora_inicio_preparacion (hora_inicio_preparacion),
  ADD INDEX idx_prioridad (prioridad),
  ADD INDEX idx_estado_hora_inicio (estado, hora_inicio_preparacion),
  ADD INDEX idx_estado_prioridad (estado, prioridad, fecha);

-- 3. Crear tabla de configuración del sistema
CREATE TABLE IF NOT EXISTS configuracion_sistema (
  id INT PRIMARY KEY AUTO_INCREMENT,
  clave VARCHAR(100) UNIQUE NOT NULL,
  valor VARCHAR(255) NOT NULL,
  tipo ENUM('INT','STRING','BOOLEAN','JSON') NOT NULL DEFAULT 'STRING',
  descripcion TEXT,
  fecha_modificacion TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_clave (clave)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- 4. Insertar valores iniciales de configuración
INSERT INTO configuracion_sistema (clave, valor, tipo, descripcion) VALUES
  ('max_pedidos_en_preparacion', '8', 'INT', 'Capacidad máxima concurrente de cocina'),
  ('tiempo_base_preparacion_minutos', '15', 'INT', 'Tiempo estimado por defecto en minutos'),
  ('demora_cocina_minutos', '25', 'INT', 'Demora actual de cocina (ajustable manualmente)'),
  ('worker_interval_segundos', '30', 'INT', 'Intervalo de ejecución del worker automático')
ON DUPLICATE KEY UPDATE
  valor = VALUES(valor),
  descripcion = VALUES(descripcion);








