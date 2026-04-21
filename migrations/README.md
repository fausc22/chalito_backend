# Migraciones SQL

Esta carpeta contiene migraciones SQL manuales del backend.  
Cada archivo representa un cambio incremental en la base de datos y debe ejecutarse en orden numerico.

## Como ejecutar migraciones manualmente

### Opcion A: MySQL Workbench
1. Abrir una conexion a la base de datos del proyecto.
2. Abrir el archivo SQL de la migracion (por ejemplo `001_empleados_base.sql`).
3. Ejecutar el script completo.
4. Repetir para las siguientes migraciones en orden.

### Opcion B: CLI de MySQL
Ejemplo:

```bash
mysql -h <host> -u <usuario> -p <base_de_datos> < migrations/001_empleados_base.sql
```

## Orden de ejecucion

Ejecutar siempre por nombre de archivo (prefijo numerico):

1. `001_empleados_base.sql`
2. `002_stock_semanal_inventario.sql`
3. `003_articulos_controla_stock.sql`

## Que hace cada archivo

- `001_empleados_base.sql` -> crea la estructura base del modulo empleados:
  - `empleados`
  - `empleados_asistencias`
  - `empleados_movimientos`
  - `empleados_liquidaciones`
- `002_stock_semanal_inventario.sql` -> modulo inventario / stock semanal manual:
  - `insumos_semanales` (catalogo configurable)
  - `semanas_stock` (una semana abierta o cerrada; restriccion de una sola ABIERTA)
  - `semanas_stock_detalle` (inicial, final y consumo por insumo)
  - inserta los 5 insumos iniciales por defecto
- `003_articulos_controla_stock.sql` -> agrega `articulos.controla_stock` y migra datos existentes por `tipo`:
  - `ELABORADO` => `controla_stock = false`
  - `BEBIDA` => `controla_stock = true`
  - `OTRO` y tipos no mapeados => `controla_stock = true`

## Seeds relacionados

En `seeds/`, `002_stock_semanal_insumos_default.sql` vuelve a asegurar los 5 insumos por nombre si faltan (idempotente). Si ya ejecutaste la migracion 002 completa, los datos suelen estar cargados y el seed no duplica filas.

## Script recomendado (Node.js)

Tambien existe `scripts/runMigrations.js`, que:
- Lee los archivos de `migrations/`
- Los ordena por nombre
- Ejecuta cada sentencia SQL en secuencia con `connection.query()` (DDL con columnas GENERATED y similares no funciona bien con `execute()` / prepared statements)

Evitar el caracter `;` dentro de lineas de comentario `-- ...` en los `.sql` de migracion: el separador de sentencias del script es ingenuo y corta aunque el `;` este en un comentario.
