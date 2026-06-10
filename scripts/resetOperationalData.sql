-- =============================================================================
-- Reset operativo El Chalito — deja catálogo/config y borra datos de prueba
-- =============================================================================
--
-- CONSERVA: articulos, categorias, ingredientes, adicionales, usuarios,
--           empleados (altas), cuentas_fondos, categoria_gastos, cupones,
--           configuracion_sistema, horarios_tienda, insumos_semanales
--
-- BORRA: pedidos, ventas, gastos, movimientos, clientes, comandas, MP, ARCA log,
--        stock semanal operativo, RRHH operativo, auditorías
--
-- IMPORTANTE:
--   1. Hacé backup antes: mysqldump -u USER -p BD > backup.sql
--   2. Detené el backend (pm2 stop chalito-prod) para evitar escrituras concurrentes
--   3. TRUNCATE en MySQL hace commit implícito (no se puede deshacer con ROLLBACK)
--
-- Uso recomendado (lee .env del backend):
--   node scripts/resetOperationalData.js          # solo muestra conteos (dry-run)
--   node scripts/resetOperationalData.js --confirm
-- =============================================================================

-- Conteos ANTES (opcional)
SELECT 'pedidos' AS tabla, COUNT(*) AS filas FROM pedidos
UNION ALL SELECT 'ventas', COUNT(*) FROM ventas
UNION ALL SELECT 'gastos', COUNT(*) FROM gastos
UNION ALL SELECT 'movimientos_fondos', COUNT(*) FROM movimientos_fondos
UNION ALL SELECT 'clientes', COUNT(*) FROM clientes
UNION ALL SELECT 'articulos', COUNT(*) FROM articulos;

SET FOREIGN_KEY_CHECKS = 0;

TRUNCATE TABLE arca_solicitudes_log;
TRUNCATE TABLE ventas_contenido;
TRUNCATE TABLE ventas;
TRUNCATE TABLE cupones_redenciones;
TRUNCATE TABLE comandas_contenido;
TRUNCATE TABLE comandas;
TRUNCATE TABLE pedidos_contenido;
TRUNCATE TABLE pedidos_pagos;
TRUNCATE TABLE checkout_sesiones_mp;
TRUNCATE TABLE pedidos;
TRUNCATE TABLE movimientos_fondos;
TRUNCATE TABLE gastos;
TRUNCATE TABLE clientes_direcciones;
TRUNCATE TABLE clientes;
TRUNCATE TABLE semanas_stock_detalle;
TRUNCATE TABLE semanas_stock;
TRUNCATE TABLE empleados_asistencias;
TRUNCATE TABLE empleados_movimientos;
TRUNCATE TABLE empleados_liquidaciones;
TRUNCATE TABLE auditorias;

SET FOREIGN_KEY_CHECKS = 1;

-- Ajustes post-limpieza
UPDATE articulos SET stock_actual = 0 WHERE controla_stock = 1;
UPDATE cuentas_fondos SET saldo = 0;
UPDATE cupones SET usos_actuales = 0;
UPDATE control_numeracion_facturas SET ultimo_numero = 0;

-- Conteos DESPUÉS (opcional)
SELECT 'pedidos' AS tabla, COUNT(*) AS filas FROM pedidos
UNION ALL SELECT 'ventas', COUNT(*) FROM ventas
UNION ALL SELECT 'gastos', COUNT(*) FROM gastos
UNION ALL SELECT 'movimientos_fondos', COUNT(*) FROM movimientos_fondos
UNION ALL SELECT 'clientes', COUNT(*) FROM clientes
UNION ALL SELECT 'articulos', COUNT(*) FROM articulos;
