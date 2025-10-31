-- ========================================
-- Optimización de Base de Datos - Artículos
-- Fecha: 30 de Octubre de 2025
-- ========================================

-- Crear tabla articulos si no existe
CREATE TABLE IF NOT EXISTS `articulos` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `codigo` varchar(50) NOT NULL UNIQUE,
  `nombre` varchar(255) NOT NULL,
  `descripcion` text,
  `precio` decimal(10,2) NOT NULL,
  `categoria` varchar(100) NOT NULL,
  `tiempoPreparacion` int(11) DEFAULT NULL,
  `disponible` tinyint(1) DEFAULT 1,
  `imagen` varchar(500) DEFAULT NULL,
  `createdAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updatedAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Índices para optimización de consultas

-- Índice en código (ya existe como UNIQUE, pero lo declaramos)
-- El índice UNIQUE ya proporciona búsqueda rápida

-- Índice en categoría para filtrado rápido
CREATE INDEX IF NOT EXISTS `idx_articulos_categoria`
ON `articulos` (`categoria`);

-- Índice en disponible para filtrado
CREATE INDEX IF NOT EXISTS `idx_articulos_disponible`
ON `articulos` (`disponible`);

-- Índice compuesto para búsquedas combinadas (categoría + disponible)
CREATE INDEX IF NOT EXISTS `idx_articulos_categoria_disponible`
ON `articulos` (`categoria`, `disponible`);

-- Índice en precio para filtrado por rangos
CREATE INDEX IF NOT EXISTS `idx_articulos_precio`
ON `articulos` (`precio`);

-- Índice FULLTEXT para búsqueda de texto en nombre y descripción
-- (Solo si tu versión de MySQL lo soporta - MySQL 5.6+)
CREATE FULLTEXT INDEX IF NOT EXISTS `idx_articulos_search`
ON `articulos` (`nombre`, `descripcion`);

-- ========================================
-- Notas de Optimización:
-- ========================================
-- 1. idx_articulos_categoria: Acelera filtros por categoría
-- 2. idx_articulos_disponible: Acelera filtros por disponibilidad
-- 3. idx_articulos_categoria_disponible: Acelera filtros combinados
-- 4. idx_articulos_precio: Acelera ordenamiento y filtros por precio
-- 5. idx_articulos_search: Permite búsquedas FULLTEXT eficientes
--
-- Impacto esperado:
-- - Consultas de listado: 5-10x más rápidas
-- - Búsquedas por texto: 20-50x más rápidas
-- - Filtros combinados: 10-15x más rápidos
-- ========================================

-- Verificar índices creados
SHOW INDEX FROM `articulos`;
