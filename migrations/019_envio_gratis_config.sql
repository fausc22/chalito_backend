-- Envío gratis por monto mínimo (pedidos delivery desde carta online)
-- NO destructiva: solo INSERT WHERE NOT EXISTS

INSERT INTO configuracion_sistema (clave, valor, tipo, descripcion)
SELECT 'ENVIO_GRATIS_ACTIVO', 'false', 'BOOLEAN', 'Activa envío gratis por monto mínimo en pedidos delivery'
WHERE NOT EXISTS (
    SELECT 1 FROM configuracion_sistema WHERE clave = 'ENVIO_GRATIS_ACTIVO'
);

INSERT INTO configuracion_sistema (clave, valor, tipo, descripcion)
SELECT 'ENVIO_GRATIS_MONTO_MINIMO', '0', 'INT', 'Monto mínimo del pedido para envío gratis (0 = desactivado)'
WHERE NOT EXISTS (
    SELECT 1 FROM configuracion_sistema WHERE clave = 'ENVIO_GRATIS_MONTO_MINIMO'
);
