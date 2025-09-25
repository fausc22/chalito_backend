// scripts/crearUsuarioInicial.js
const mysql = require('mysql2/promise');
const bcrypt = require('bcryptjs');
require('dotenv').config();

// Configurar la conexión a la base de datos
const pool = mysql.createPool({
    host: localhost,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_DATABASE, 
    connectionLimit: 10
});

const crearUsuarioInicial = async () => {
    try {
        console.log('🔗 Conectando a la base de datos Sistema Chalito...');

        // Datos del usuario inicial - Adaptado a tabla usuarios
        const datosUsuario = {
            nombre: 'ADMINISTRADOR SISTEMA',
            email: 'admin@gmail.com',
            usuario: 'admin',
            password: 'admin123', 
            rol: 'ADMIN' // Roles disponibles: ADMIN, GERENTE, CAJERO, COCINA
        };

        // Verificar si ya existe el usuario
        const [usuarioExistente] = await pool.execute(
            'SELECT id FROM usuarios WHERE usuario = ?',
            [datosUsuario.usuario]
        );

        if (usuarioExistente.length > 0) {
            console.log('⚠️  El usuario ya existe en la base de datos');
            return;
        }

        // Hashear la contraseña
        console.log('🔒 Hasheando contraseña...');
        const hashedPassword = await bcrypt.hash(datosUsuario.password, 10);

        // Insertar el usuario
        console.log('👤 Creando usuario inicial...');
        const query = `
            INSERT INTO usuarios (nombre, email, usuario, password, rol, activo) 
            VALUES (?, ?, ?, ?, ?, 1)
        `;

        const [result] = await pool.execute(query, [
            datosUsuario.nombre,
            datosUsuario.email,
            datosUsuario.usuario,
            hashedPassword,
            datosUsuario.rol
        ]);

        console.log('✅ Usuario inicial creado exitosamente!');
        console.log(`📝 ID del usuario: ${result.insertId}`);
        console.log(`👤 Usuario: ${datosUsuario.usuario}`);
        console.log(`🔑 Contraseña: ${datosUsuario.password}`);
        console.log(`👔 Rol: ${datosUsuario.rol}`);
        console.log(`📧 Email: ${datosUsuario.email}`);

    } catch (error) {
        console.error('❌ Error al crear usuario inicial:', error);
    } 
};

const crearUsuariosPredefinidos = async () => {
    try {
        console.log('🔗 Conectando a la base de datos Sistema Chalito...');

        // Array de usuarios predefinidos
        const usuariosPredefinidos = [
            
            {
                nombre: 'Gerente Principal',
                email: 'gerente@chalito.com',
                usuario: 'gerente',
                password: 'gerente123',
                rol: 'GERENTE'
            },
            {
                nombre: 'Cajero Principal',
                email: 'cajero@chalito.com',
                usuario: 'cajero',
                password: 'cajero123',
                rol: 'CAJERO'
            },
            {
                nombre: 'Chef Principal',
                email: 'cocina@chalito.com',
                usuario: 'chef',
                password: 'cocina123',
                rol: 'COCINA'
            }
        ];

        for (const datosUsuario of usuariosPredefinidos) {
            // Verificar si ya existe el usuario
            const [usuarioExistente] = await pool.execute(
                'SELECT id FROM usuarios WHERE usuario = ?',
                [datosUsuario.usuario]
            );

            if (usuarioExistente.length > 0) {
                console.log(`⚠️  El usuario '${datosUsuario.usuario}' ya existe`);
                continue;
            }

            // Hashear la contraseña
            const hashedPassword = await bcrypt.hash(datosUsuario.password, 10);

            // Insertar el usuario
            const query = `
                INSERT INTO usuarios (nombre, email, usuario, password, rol, activo) 
                VALUES (?, ?, ?, ?, ?, 1)
            `;

            const [result] = await pool.execute(query, [
                datosUsuario.nombre,
                datosUsuario.email,
                datosUsuario.usuario,
                hashedPassword,
                datosUsuario.rol
            ]);

            console.log(`✅ Usuario '${datosUsuario.usuario}' creado - ID: ${result.insertId}`);
        }

        console.log('🎉 Todos los usuarios predefinidos han sido procesados!');

    } catch (error) {
        console.error('❌ Error al crear usuarios predefinidos:', error);
    } finally {
        await pool.end();
        console.log('🔚 Conexión cerrada');
    }
};




(async () => {
    await crearUsuarioInicial();
    await crearUsuariosPredefinidos();
    process.exit(0);
})();