// scripts/initInventario.js - Sistema Chalito
const mysql = require('mysql2/promise');
require('dotenv').config();

// Configurar la conexión a la base de datos
const pool = mysql.createPool({
    host: process.env.DB_HOST,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_DATABASE,
    port: process.env.DB_PORT || 3306,
    connectionLimit: 10
});

const inicializarInventario = async () => {
    try {
        console.log('🔗 Conectando a la base de datos Sistema Chalito...');
        console.log('📦 Inicializando datos de inventario...\n');

        // =====================================================
        // 1. CREAR CATEGORÍAS
        // =====================================================
        console.log('📁 Creando categorías...');

        const categorias = [
            { nombre: 'HAMBURGUESAS', descripcion: 'Hamburguesas y sandwiches', orden: 1 },
            { nombre: 'PIZZAS', descripcion: 'Pizzas artesanales', orden: 2 },
            { nombre: 'BEBIDAS', descripcion: 'Bebidas frías y calientes', orden: 3 },
            { nombre: 'ACOMPAÑAMIENTOS', descripcion: 'Papas, ensaladas, etc.', orden: 4 },
            { nombre: 'POSTRES', descripcion: 'Postres y dulces', orden: 5 },
            { nombre: 'INGREDIENTES FRESCOS', descripcion: 'Vegetales y carnes', orden: 6 }
        ];

        const categoriasCreadas = {};

        for (const categoria of categorias) {
            // Verificar si existe
            const [existe] = await pool.execute(
                'SELECT id FROM categorias WHERE nombre = ?',
                [categoria.nombre]
            );

            if (existe.length === 0) {
                const [result] = await pool.execute(
                    'INSERT INTO categorias (nombre, descripcion, orden) VALUES (?, ?, ?)',
                    [categoria.nombre, categoria.descripcion, categoria.orden]
                );
                categoriasCreadas[categoria.nombre] = result.insertId;
                console.log(`   ✅ ${categoria.nombre} - ID: ${result.insertId}`);
            } else {
                categoriasCreadas[categoria.nombre] = existe[0].id;
                console.log(`   ⚠️  ${categoria.nombre} ya existe - ID: ${existe[0].id}`);
            }
        }

        // =====================================================
        // 2. CREAR INGREDIENTES
        // =====================================================
        console.log('\n🧄 Creando ingredientes...');

        const ingredientes = [
            // Carnes
            { nombre: 'Carne de Res 150g', descripcion: 'Medallón de carne de res', precio_extra: 0.00 },
            { nombre: 'Pollo Grillado', descripcion: 'Pechuga de pollo grillada', precio_extra: 0.00 },
            { nombre: 'Bacon', descripcion: 'Tiras de bacon ahumado', precio_extra: 1.50 },
            { nombre: 'Jamón', descripcion: 'Jamón cocido', precio_extra: 1.00 },
            
            // Vegetales
            { nombre: 'Lechuga', descripcion: 'Hojas de lechuga fresca', precio_extra: 0.00 },
            { nombre: 'Tomate', descripcion: 'Rodajas de tomate', precio_extra: 0.00 },
            { nombre: 'Cebolla', descripcion: 'Aros de cebolla', precio_extra: 0.00 },
            { nombre: 'Pepino', descripcion: 'Rodajas de pepino', precio_extra: 0.50 },
            { nombre: 'Palta', descripcion: 'Palta fresca', precio_extra: 2.00 },
            { nombre: 'Champiñones', descripcion: 'Champiñones grillados', precio_extra: 1.50 },
            
            // Quesos
            { nombre: 'Queso Cheddar', descripcion: 'Queso cheddar americano', precio_extra: 1.00 },
            { nombre: 'Queso Mozzarella', descripcion: 'Queso mozzarella', precio_extra: 1.00 },
            { nombre: 'Queso Azul', descripcion: 'Queso roquefort', precio_extra: 2.00 },
            
            // Salsas
            { nombre: 'Salsa BBQ', descripcion: 'Salsa barbacoa', precio_extra: 0.50 },
            { nombre: 'Mayonesa', descripcion: 'Mayonesa casera', precio_extra: 0.00 },
            { nombre: 'Ketchup', descripcion: 'Salsa de tomate', precio_extra: 0.00 },
            { nombre: 'Mostaza', descripcion: 'Mostaza Dijon', precio_extra: 0.50 },
            
            // Panes
            { nombre: 'Pan de Hamburguesa', descripcion: 'Pan brioche para hamburguesas', precio_extra: 0.00 },
            { nombre: 'Pan Integral', descripcion: 'Pan integral con semillas', precio_extra: 0.50 },
            
            // Otros
            { nombre: 'Papas Fritas', descripcion: 'Papas cortadas bastón', precio_extra: 0.00 },
            { nombre: 'Aros de Cebolla', descripcion: 'Aros de cebolla empanados', precio_extra: 2.00 }
        ];

        const ingredientesCreados = {};

        for (const ingrediente of ingredientes) {
            const [existe] = await pool.execute(
                'SELECT id FROM ingredientes WHERE nombre = ?',
                [ingrediente.nombre]
            );

            if (existe.length === 0) {
                const [result] = await pool.execute(
                    'INSERT INTO ingredientes (nombre, descripcion, precio_extra, disponible) VALUES (?, ?, ?, 1)',
                    [ingrediente.nombre, ingrediente.descripcion, ingrediente.precio_extra]
                );
                ingredientesCreados[ingrediente.nombre] = result.insertId;
                console.log(`   ✅ ${ingrediente.nombre} ($${ingrediente.precio_extra}) - ID: ${result.insertId}`);
            } else {
                ingredientesCreados[ingrediente.nombre] = existe[0].id;
                console.log(`   ⚠️  ${ingrediente.nombre} ya existe - ID: ${existe[0].id}`);
            }
        }

        // =====================================================
        // 3. CREAR ARTÍCULOS
        // =====================================================
        console.log('\n📦 Creando artículos...');

        const articulos = [
            // Hamburguesas Elaboradas
            {
                categoria: 'HAMBURGUESAS',
                nombre: 'Hamburguesa Clásica',
                descripcion: 'Hamburguesa con carne, lechuga, tomate y mayonesa',
                precio: 8.50,
                stock_actual: 50,
                stock_minimo: 10,
                tipo: 'ELABORADO',
                ingredientes: [
                    { nombre: 'Pan de Hamburguesa', cantidad: 1, unidad: 'UNIDADES' },
                    { nombre: 'Carne de Res 150g', cantidad: 1, unidad: 'UNIDADES' },
                    { nombre: 'Lechuga', cantidad: 2, unidad: 'UNIDADES' },
                    { nombre: 'Tomate', cantidad: 2, unidad: 'UNIDADES' },
                    { nombre: 'Mayonesa', cantidad: 1, unidad: 'UNIDADES' }
                ]
            },
            {
                categoria: 'HAMBURGUESAS',
                nombre: 'Hamburguesa BBQ Bacon',
                descripcion: 'Hamburguesa con carne, bacon, queso cheddar y salsa BBQ',
                precio: 12.50,
                stock_actual: 30,
                stock_minimo: 8,
                tipo: 'ELABORADO',
                ingredientes: [
                    { nombre: 'Pan de Hamburguesa', cantidad: 1, unidad: 'UNIDADES' },
                    { nombre: 'Carne de Res 150g', cantidad: 1, unidad: 'UNIDADES' },
                    { nombre: 'Bacon', cantidad: 3, unidad: 'UNIDADES' },
                    { nombre: 'Queso Cheddar', cantidad: 1, unidad: 'UNIDADES' },
                    { nombre: 'Salsa BBQ', cantidad: 1, unidad: 'UNIDADES' },
                    { nombre: 'Lechuga', cantidad: 2, unidad: 'UNIDADES' }
                ]
            },
            {
                categoria: 'HAMBURGUESAS',
                nombre: 'Hamburguesa Vegetariana',
                descripcion: 'Hamburguesa con palta, queso, vegetales frescos',
                precio: 9.00,
                stock_actual: 25,
                stock_minimo: 5,
                tipo: 'ELABORADO',
                ingredientes: [
                    { nombre: 'Pan Integral', cantidad: 1, unidad: 'UNIDADES' },
                    { nombre: 'Palta', cantidad: 0.5, unidad: 'UNIDADES' },
                    { nombre: 'Queso Mozzarella', cantidad: 1, unidad: 'UNIDADES' },
                    { nombre: 'Lechuga', cantidad: 3, unidad: 'UNIDADES' },
                    { nombre: 'Tomate', cantidad: 3, unidad: 'UNIDADES' },
                    { nombre: 'Pepino', cantidad: 2, unidad: 'UNIDADES' }
                ]
            },

            // Bebidas (No elaboradas)
            {
                categoria: 'BEBIDAS',
                nombre: 'Coca Cola 500ml',
                descripcion: 'Gaseosa Coca Cola',
                precio: 2.50,
                stock_actual: 100,
                stock_minimo: 20,
                tipo: 'BEBIDA',
                codigo_barra: '7790895001234'
            },
            {
                categoria: 'BEBIDAS',
                nombre: 'Agua Mineral 500ml',
                descripcion: 'Agua mineral sin gas',
                precio: 1.50,
                stock_actual: 80,
                stock_minimo: 15,
                tipo: 'BEBIDA',
                codigo_barra: '7790895001235'
            },
            {
                categoria: 'BEBIDAS',
                nombre: 'Cerveza Quilmes 473ml',
                descripcion: 'Cerveza rubia',
                precio: 3.50,
                stock_actual: 60,
                stock_minimo: 12,
                tipo: 'BEBIDA',
                codigo_barra: '7790895001236'
            },

            // Acompañamientos (Algunos elaborados)
            {
                categoria: 'ACOMPAÑAMIENTOS',
                nombre: 'Papas Fritas Grandes',
                descripcion: 'Porción grande de papas fritas',
                precio: 4.50,
                stock_actual: 40,
                stock_minimo: 8,
                tipo: 'ELABORADO',
                ingredientes: [
                    { nombre: 'Papas Fritas', cantidad: 200, unidad: 'GRAMOS' }
                ]
            },
            {
                categoria: 'ACOMPAÑAMIENTOS',
                nombre: 'Aros de Cebolla',
                descripcion: 'Aros de cebolla empanados y fritos',
                precio: 5.50,
                stock_actual: 20,
                stock_minimo: 5,
                tipo: 'ELABORADO',
                ingredientes: [
                    { nombre: 'Aros de Cebolla', cantidad: 8, unidad: 'UNIDADES' }
                ]
            },

            // Postres (No elaborados)
            {
                categoria: 'POSTRES',
                nombre: 'Helado Chocolate',
                descripcion: 'Copa de helado de chocolate',
                precio: 3.50,
                stock_actual: 15,
                stock_minimo: 3,
                tipo: 'OTRO'
            },
            {
                categoria: 'POSTRES',
                nombre: 'Flan Casero',
                descripcion: 'Flan con dulce de leche',
                precio: 4.00,
                stock_actual: 12,
                stock_minimo: 2,
                tipo: 'OTRO'
            }
        ];

        for (const articulo of articulos) {
            // Verificar si existe
            const [existe] = await pool.execute(
                'SELECT id FROM articulos WHERE nombre = ?',
                [articulo.nombre]
            );

            if (existe.length > 0) {
                console.log(`   ⚠️  ${articulo.nombre} ya existe - ID: ${existe[0].id}`);
                continue;
            }

            // Obtener ID de categoría
            const categoriaId = categoriasCreadas[articulo.categoria];
            if (!categoriaId) {
                console.log(`   ❌ Categoría ${articulo.categoria} no encontrada para ${articulo.nombre}`);
                continue;
            }

            // Iniciar transacción
            const connection = await pool.getConnection();
            await connection.beginTransaction();

            try {
                // Insertar artículo
                const [resultArticulo] = await connection.execute(
                    `INSERT INTO articulos (
                        categoria_id, codigo_barra, nombre, descripcion, precio, 
                        stock_actual, stock_minimo, tipo, activo
                    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1)`,
                    [
                        categoriaId,
                        articulo.codigo_barra || null,
                        articulo.nombre,
                        articulo.descripcion,
                        articulo.precio,
                        articulo.stock_actual,
                        articulo.stock_minimo,
                        articulo.tipo
                    ]
                );

                const articuloId = resultArticulo.insertId;

                // Si es elaborado, agregar ingredientes
                if (articulo.tipo === 'ELABORADO' && articulo.ingredientes) {
                    for (const ing of articulo.ingredientes) {
                        const ingredienteId = ingredientesCreados[ing.nombre];
                        if (ingredienteId) {
                            await connection.execute(
                                `INSERT INTO articulo_contenido (
                                    articulo_id, ingrediente_id, unidad_medida, cantidad
                                ) VALUES (?, ?, ?, ?)`,
                                [articuloId, ingredienteId, ing.unidad || 'UNIDADES', ing.cantidad]
                            );
                        }
                    }
                    console.log(`   ✅ ${articulo.nombre} ($${articulo.precio}) - ${articulo.ingredientes.length} ingredientes - ID: ${articuloId}`);
                } else {
                    console.log(`   ✅ ${articulo.nombre} ($${articulo.precio}) - ${articulo.tipo} - ID: ${articuloId}`);
                }

                await connection.commit();
                connection.release();

            } catch (transactionError) {
                await connection.rollback();
                connection.release();
                console.log(`   ❌ Error creando ${articulo.nombre}:`, transactionError.message);
            }
        }

        // =====================================================
        // 4. MOSTRAR RESUMEN
        // =====================================================
        console.log('\n📊 Resumen de inicialización:\n');

        // Contar categorías
        const [totalCategorias] = await pool.execute('SELECT COUNT(*) as total FROM categorias');
        console.log(`📁 Categorías: ${totalCategorias[0].total}`);

        // Contar ingredientes
        const [totalIngredientes] = await pool.execute('SELECT COUNT(*) as total FROM ingredientes');
        console.log(`🧄 Ingredientes: ${totalIngredientes[0].total}`);

        // Contar artículos por tipo
        const [statsArticulos] = await pool.execute(`
            SELECT 
                COUNT(*) as total,
                COUNT(CASE WHEN tipo = 'ELABORADO' THEN 1 END) as elaborados,
                COUNT(CASE WHEN tipo = 'BEBIDA' THEN 1 END) as bebidas,
                COUNT(CASE WHEN tipo = 'OTRO' THEN 1 END) as otros,
                SUM(stock_actual) as stock_total
            FROM articulos WHERE activo = 1
        `);

        const stats = statsArticulos[0];
        console.log(`📦 Artículos: ${stats.total} (${stats.elaborados} elaborados, ${stats.bebidas} bebidas, ${stats.otros} otros)`);
        console.log(`📈 Stock total: ${stats.stock_total} unidades`);

        // Contar relaciones de contenido
        const [totalContenido] = await pool.execute('SELECT COUNT(*) as total FROM articulo_contenido');
        console.log(`🔗 Relaciones ingrediente-artículo: ${totalContenido[0].total}`);

        console.log('\n✅ ¡Inicialización de inventario completada exitosamente!');
        console.log('🎯 El sistema está listo para gestionar el inventario del restaurante Chalito\n');

    } catch (error) {
        console.error('❌ Error durante la inicialización:', error);
    } finally {
        await pool.end();
        console.log('🔚 Conexión cerrada');
    }
};

// Función para limpiar inventario (solo en desarrollo)
const limpiarInventario = async () => {
    if (process.env.NODE_ENV === 'production') {
        console.log('❌ No se puede limpiar el inventario en producción');
        return;
    }

    try {
        console.log('🧹 Limpiando inventario...');

        // Orden importante por foreign keys
        await pool.execute('DELETE FROM articulo_contenido');
        console.log('   🗑️  Contenido de artículos eliminado');

        await pool.execute('DELETE FROM articulos');
        console.log('   🗑️  Artículos eliminados');

        await pool.execute('DELETE FROM ingredientes');
        console.log('   🗑️  Ingredientes eliminados');

        await pool.execute('DELETE FROM categorias');
        console.log('   🗑️  Categorías eliminadas');

        console.log('✅ Inventario limpiado');

    } catch (error) {
        console.error('❌ Error limpiando inventario:', error);
    }
};

// Ejecutar script
(async () => {
    const accion = process.argv[2];

    if (accion === 'clean') {
        await limpiarInventario();
    } else {
        await inicializarInventario();
    }

    process.exit(0);
})();