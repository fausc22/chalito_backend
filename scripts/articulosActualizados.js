// scripts/actualizarArticulosReales.js - Sistema Chalito
const mysql = require('mysql2/promise');
require('dotenv').config();

const pool = mysql.createPool({
    host: process.env.DB_HOST,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_DATABASE,
    port: process.env.DB_PORT || 3306,
    connectionLimit: 10
});

const actualizarArticulos = async () => {
    try {
        console.log('🔗 Conectando a la base de datos...');
        console.log('📦 Actualizando artículos con productos reales...\n');

        // =====================================================
        // 1. MARCAR ARTÍCULOS ACTUALES COMO INACTIVOS
        // =====================================================
        console.log('🔄 Marcando artículos actuales como inactivos...');
        const [resultInactivos] = await pool.execute(
            'UPDATE articulos SET activo = 0 WHERE activo = 1'
        );
        console.log(`   ✅ ${resultInactivos.affectedRows} artículos marcados como inactivos\n`);

        // =====================================================
        // 2. CREAR/VERIFICAR CATEGORÍAS NECESARIAS
        // =====================================================
        console.log('📁 Verificando categorías...');

        const categoriasNecesarias = [
            { nombre: 'HAMBURGUESAS', descripcion: 'Hamburguesas gourmet', orden: 1 },
            { nombre: 'SÁNDWICHES', descripcion: 'Sándwiches especiales', orden: 2 },
            { nombre: 'EMPANADAS', descripcion: 'Empanadas caseras', orden: 3 },
            { nombre: 'PAPAS', descripcion: 'Papas y acompañamientos', orden: 4 }
        ];

        const categoriasMap = {};

        for (const cat of categoriasNecesarias) {
            const [existe] = await pool.execute(
                'SELECT id FROM categorias WHERE nombre = ?',
                [cat.nombre]
            );

            if (existe.length === 0) {
                const [result] = await pool.execute(
                    'INSERT INTO categorias (nombre, descripcion, orden) VALUES (?, ?, ?)',
                    [cat.nombre, cat.descripcion, cat.orden]
                );
                categoriasMap[cat.nombre] = result.insertId;
                console.log(`   ✅ Creada: ${cat.nombre}`);
            } else {
                categoriasMap[cat.nombre] = existe[0].id;
                console.log(`   ⚠️  Ya existe: ${cat.nombre}`);
            }
        }

        // =====================================================
        // 3. INSERTAR NUEVOS ARTÍCULOS
        // =====================================================
        console.log('\n📦 Insertando artículos reales...');

        const productos = [
            { nombre: "Hamburguesa Diabla", descripcion: "Brioche, carne, cheddar picante, cebolla caramelizada, panceta ahumada, aderezo de la casa. No incluye papas.", precio: 12000, imagen: "hamburguesa-diabla.jpg", categoria: "HAMBURGUESAS" },
            { nombre: "Hamburguesa Clásica", descripcion: "Brioche, carne, cheddar, lechuga, tomate, aderezo de la casa. No incluye papas.", precio: 11000, imagen: "hamburguesa-clasica.jpg", categoria: "HAMBURGUESAS" },
            { nombre: "Hamburguesa Cheeseburger", descripcion: "Brioche, carne, cheddar, panceta ahumado, aderezo de la casa. No incluye papas.", precio: 11500, imagen: "hamburguesa-cheeseburger.jpg", categoria: "HAMBURGUESAS" },
            { nombre: "Hamburguesa La Funghi", descripcion: "Brioche, carne, queso ahumado, cebolla caramelizada, hongos, aderezo de la casa. No incluye papas.", precio: 12000, imagen: "hamburguesa-funghi.jpg", categoria: "HAMBURGUESAS" },
            { nombre: "Hamburguesa Whisky", descripcion: "Brioche, carne, cheddar, panceta ahumada, cebolla morada cocida, salsa barbacoa al whisky. No incluye papas.", precio: 12000, imagen: "hamburguesa-whisky.jpeg", categoria: "HAMBURGUESAS" },
            { nombre: "Hamburguesa MC Thomson", descripcion: "Brioche, carne, provoleta, huevo frito, mayochimi, repollo curado. No incluye papas.", precio: 12000, imagen: "hamburguesa-mcthomson.jpg", categoria: "HAMBURGUESAS" },
            { nombre: "Hamburguesa Bluecheese", descripcion: "Pan, carne, queso azul, rúcula, tomates cherry confitados, salsa. No incluye papas.", precio: 12000, imagen: "hamburguesa-bluecheese.jpg", categoria: "HAMBURGUESAS" },
            { nombre: "Hamburguesa Weissman", descripcion: "Brioche, carne, cheddar, cebolla morada spread, pepinos encurtidos. No incluye papas.", precio: 12000, imagen: "hamburguesa-weissman.jpeg", categoria: "HAMBURGUESAS" },
            { nombre: "Choripan", descripcion: "Pan, chorizo, mayochimi, lechuga y tomate. No incluye papas.", precio: 5000, imagen: "choripan.jpg", categoria: "SÁNDWICHES" },
            { nombre: "Pollo", descripcion: "Pan, pollo desmenuzado con crema y puerro, tomates, espinaca fresca, queso danbo, alioli. No incluye papas.", precio: 15000, imagen: "pollo.jpg", categoria: "SÁNDWICHES" },
            { nombre: "Lomo", descripcion: "Pan, lomo, rúcula/lechuga, jamón cocido al natural, huevo frito, queso, tomate, mayonesa. No incluye papas.", precio: 19500, imagen: "lomo.jpg", categoria: "SÁNDWICHES" },
            { nombre: "Vacío", descripcion: "Pan, vacío desmenuzado, pimientos asados, mozzarella, pategras ahumado, mayochimi. No incluye papas.", precio: 19000, imagen: "vacio.png", categoria: "SÁNDWICHES" },
            { nombre: "Milanesa", descripcion: "Pan, milanesa ternera, jamón cocido al natural, queso, lechuga, tomate. No incluye papas.", precio: 18000, imagen: "milanesa.jpg", categoria: "SÁNDWICHES" },
            { nombre: "Bondiola", descripcion: "Pan, bondiola desmenuzada, provoleta gratinada, coleslaw, salsa BBQ al whishy. No incluye papas.", precio: 17000, imagen: "bondiola.jpg", categoria: "SÁNDWICHES" },
            { nombre: "Empanada de Bondiola", descripcion: "Bondiola desmenuzada y queso.", precio: 2000, imagen: "empanada-bondiola.jpg", categoria: "EMPANADAS" },
            { nombre: "Empanada de Pollo", descripcion: "Pollo desmenuzado con crema, puerros, hongos y queso parmesano.", precio: 2000, imagen: "empanada-pollo.jpg", categoria: "EMPANADAS" },
            { nombre: "Empanada de carne (vacío)", descripcion: "Vacío desmenuzado y queso provoleta.", precio: 2000, imagen: "empanada-carne.jpg", categoria: "EMPANADAS" },
            { nombre: "Empanada de Jamón y Queso", descripcion: "Jamón cocido y queso muzzarella.", precio: 2000, imagen: "empanada-jamonyqueso.jpg", categoria: "EMPANADAS" },
            { nombre: "Empanada de Cebolla y Queso", descripcion: "Cebolla salteada y queso muzzarella.", precio: 2000, imagen: "empanada-cebollayqueso.jpg", categoria: "EMPANADAS" },
            { nombre: "Empanada de Cebolla y Roquefort", descripcion: "Cebolla salteada y queso roquefort.", precio: 2000, imagen: "empanada-cebollayroquefort.jpg", categoria: "EMPANADAS" },
            { nombre: "Porcion de Papas Clásicas", descripcion: "Porcion de papas fritas clásicas.", precio: 4500, imagen: "papas-fritas.png", categoria: "PAPAS" },
            { nombre: "Papas con Cheddar", descripcion: "Papas clásicas con queso cheddar.", precio: 9000, imagen: "papas-cheddar.jpg", categoria: "PAPAS" },
            { nombre: "Papas BCM", descripcion: "Papas, queso cheddar, lomo, panceta ahumada y cebolla de verdeo.", precio: 13300, imagen: "papas-bcm.jpg", categoria: "PAPAS" },
            { nombre: "Papas Tasty Cream", descripcion: "Papas, panceta ahumada, cebolla de verdeo y crema.", precio: 11000, imagen: "papas-tastycream.jpg", categoria: "PAPAS" }
        ];

        let insertados = 0;
        let errores = 0;

        for (const producto of productos) {
            try {
                const categoriaId = categoriasMap[producto.categoria];
                if (!categoriaId) {
                    console.log(`   ❌ Categoría no encontrada: ${producto.categoria}`);
                    errores++;
                    continue;
                }

                const imagenUrl = `/resources/img_art/${producto.imagen}`;

                await pool.execute(
                    `INSERT INTO articulos (
                        categoria_id, nombre, descripcion, precio, 
                        stock_actual, stock_minimo, tipo, imagen_url, activo
                    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1)`,
                    [
                        categoriaId,
                        producto.nombre,
                        producto.descripcion,
                        producto.precio,
                        50, // Stock inicial
                        5,  // Stock mínimo
                        'OTRO', // Por ahora todos como OTRO
                        imagenUrl
                    ]
                );

                insertados++;
                console.log(`   ✅ ${producto.nombre} - $${producto.precio.toLocaleString('es-AR')}`);

            } catch (error) {
                console.log(`   ❌ Error con ${producto.nombre}:`, error.message);
                errores++;
            }
        }

        // =====================================================
        // 4. RESUMEN
        // =====================================================
        console.log('\n📊 Resumen:');
        console.log(`   ✅ Artículos insertados: ${insertados}`);
        console.log(`   ❌ Errores: ${errores}`);
        console.log(`   📦 Total artículos activos: ${insertados}`);
        
        console.log('\n✅ Actualización completada exitosamente!');
        console.log('📸 No olvides copiar las imágenes a: chalito_backend/resources/img_art/\n');

    } catch (error) {
        console.error('❌ Error durante la actualización:', error);
    } finally {
        await pool.end();
        console.log('🔚 Conexión cerrada');
    }
};

// Ejecutar
actualizarArticulos();