-- Migración: Limpiar pedidos antiguos que quedaron en estado EN_PREPARACION
-- Fecha: 2025-01-XX
-- Descripción: Actualiza pedidos antiguos en EN_PREPARACION a ENTREGADO para limpiar el sistema

-- IMPORTANTE: Este script debe ejecutarse manualmente o como parte de una tarea de limpieza
-- Los pedidos que quedaron en EN_PREPARACION de días anteriores se marcan como ENTREGADO
-- para que el sistema pueda empezar cada día limpio

-- Opción 1: Marcar como ENTREGADO (si consideras que fueron entregados pero no se marcó)
UPDATE pedidos 
SET estado = 'ENTREGADO',
    fecha_modificacion = NOW()
WHERE estado = 'EN_PREPARACION'
  AND DATE(fecha) < CURDATE()
  AND hora_inicio_preparacion IS NOT NULL;

-- Opción 2: Marcar como CANCELADO (si prefieres cancelar los pedidos antiguos)
-- Descomenta la siguiente línea si prefieres esta opción en lugar de la anterior:
-- UPDATE pedidos 
-- SET estado = 'CANCELADO',
--     fecha_modificacion = NOW()
-- WHERE estado = 'EN_PREPARACION'
--   AND DATE(fecha) < CURDATE();

-- Verificar cuántos pedidos se actualizaron
SELECT 
    COUNT(*) as pedidos_limpiados,
    MIN(fecha) as fecha_mas_antigua,
    MAX(fecha) as fecha_mas_reciente
FROM pedidos 
WHERE estado IN ('ENTREGADO', 'CANCELADO')
  AND DATE(fecha_modificacion) = CURDATE()
  AND fecha_modificacion >= DATE_SUB(NOW(), INTERVAL 1 HOUR);








