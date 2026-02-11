-- Migración: Permitir stock negativo en artículos
-- Fecha: 2025-01-XX
-- Descripción: Elimina la restricción CHECK que impide stock negativo para permitir ventas con stock insuficiente
-- Esto permite que el stock_actual pueda ser negativo (ej: -10, -130) cuando se vende más de lo disponible

-- IMPORTANTE: En MySQL 8.0.19+, se puede usar DROP CHECK directamente
-- Para versiones anteriores, puede ser necesario recrear la tabla o usar otra sintaxis

-- Método 1: Para MySQL 8.0.19+ (recomendado)
ALTER TABLE articulos DROP CHECK articulos_chk_stock;

-- Si el método anterior falla, usar este método alternativo:
-- 1. Primero, eliminar solo la parte de stock_actual del CHECK (si es posible)
-- 2. O recrear la restricción sin la validación de stock_actual >= 0

-- Método alternativo: Recrear la restricción sin validar stock_actual >= 0
-- (Solo validar stock_minimo >= 0)
-- ALTER TABLE articulos DROP CHECK articulos_chk_stock;
-- ALTER TABLE articulos ADD CONSTRAINT articulos_chk_stock_minimo CHECK (stock_minimo >= 0);

-- Verificar que la restricción se eliminó correctamente
SELECT CONSTRAINT_NAME, CONSTRAINT_TYPE 
FROM INFORMATION_SCHEMA.TABLE_CONSTRAINTS 
WHERE TABLE_SCHEMA = DATABASE() 
  AND TABLE_NAME = 'articulos' 
  AND CONSTRAINT_NAME LIKE '%stock%';

