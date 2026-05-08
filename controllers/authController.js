const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const db = require('./dbPromise');
const { auditarAuth, limpiarDatosSensibles } = require('../middlewares/auditoriaMiddleware');

// ✅ CONFIGURACIÓN PARA 7 DÍAS 
const getTokenExpiration = () => {
    const isDevelopment = process.env.NODE_ENV === 'development';
    return {
        accessToken: isDevelopment ? '2h' : '1h',
        refreshToken: '7d' // 7 días como solicitaste
    };
};



// ✅ Validar que los secrets estén configurados correctamente
const validateSecrets = () => {
    if (!process.env.JWT_SECRET || process.env.JWT_SECRET.length < 32) {
        console.error('❌ JWT_SECRET debe tener al menos 32 caracteres');
        process.exit(1);
    }
    if (!process.env.JWT_REFRESH_SECRET || process.env.JWT_REFRESH_SECRET.length < 32) {
        console.error('❌ JWT_REFRESH_SECRET debe tener al menos 32 caracteres');
        process.exit(1);
    }
};

validateSecrets();



// ✅ Función helper para crear tokens
const createTokens = (usuario, remember = false) => {
    const { accessToken: accessExp, refreshToken: refreshExp } = getTokenExpiration();

    const tokenPayload = { 
        id: usuario.id, 
        rol: usuario.rol,
        nombre: usuario.nombre,
        usuario: usuario.usuario,
        iat: Math.floor(Date.now() / 1000)
    };

    const accessToken = jwt.sign(tokenPayload, process.env.JWT_SECRET, { expiresIn: accessExp });
    
    // ✅ CREAR refresh token SIEMPRE que remember sea true
    let refreshToken = null;
    if (remember) {
        refreshToken = jwt.sign(
            { 
                id: usuario.id, 
                type: 'refresh',
                iat: Math.floor(Date.now() / 1000) 
            }, 
            process.env.JWT_REFRESH_SECRET, 
            { expiresIn: refreshExp }
        );
    }

    return { accessToken, refreshToken, accessExp, refreshExp };
};

exports.login = async (req, res) => {
    const { username, password, remember = false } = req.body;

    // ✅ Convertir a boolean si viene como string
    const rememberBool = remember === true || remember === 'true';

    if (!username || !password) {
        await auditarAuth(req, {
            accion: 'LOGIN_FAILED',
            usuarioNombre: username || 'DESCONOCIDO',
            estado: 'FALLIDO',
            detallesAdicionales: 'Datos incompletos - usuario y/o contraseña faltante'
        });
        
        return res.status(400).json({ message: 'Usuario y contraseña son obligatorios' });
    }

    try {
        // Buscar usuario activo por nombre de usuario
        const [usuarios] = await db.execute(
            'SELECT * FROM usuarios WHERE usuario = ? AND activo = 1', 
            [username]
        );

        if (usuarios.length === 0) {
            await auditarAuth(req, {
                accion: 'LOGIN_FAILED',
                usuarioNombre: username,
                estado: 'FALLIDO',
                detallesAdicionales: 'Usuario no encontrado o inactivo'
            });
            
            return res.status(401).json({ message: 'Usuario no encontrado o inactivo' });
        }

        const usuario = usuarios[0];

        // Verificar contraseña
        const validPassword = await bcrypt.compare(password, usuario.password);
        if (!validPassword) {
            await auditarAuth(req, {
                accion: 'LOGIN_FAILED',
                usuarioId: usuario.id,
                usuarioNombre: usuario.nombre,
                estado: 'FALLIDO',
                detallesAdicionales: 'Contraseña incorrecta'
            });
            
            return res.status(401).json({ message: 'Contraseña incorrecta' });
        }

        await db.execute(
            'UPDATE usuarios SET ultima_conexion = NOW() WHERE id = ?',
            [usuario.id]
        );

        const [usuariosActualizados] = await db.execute(
            `SELECT id, nombre, email, usuario, rol, avatar_key, ultima_conexion
             FROM usuarios
             WHERE id = ?`,
            [usuario.id]
        );

        const usuarioActualizado = usuariosActualizados[0] || usuario;

        // ✅ Crear tokens
        const { accessToken, refreshToken, accessExp, refreshExp } = createTokens(usuario, rememberBool);

        // ✅ PWA COMPATIBLE: NO configurar cookies HTTPOnly, el frontend manejará localStorage
        // Simplemente enviar el refresh token en la respuesta para que el frontend lo guarde

        // ✅ Auditar login exitoso
        await auditarAuth(req, {
            accion: 'LOGIN',
            usuarioId: usuario.id,
            usuarioNombre: usuario.nombre,
            estado: 'EXITOSO',
            detallesAdicionales: `Login exitoso PWA - Rol: ${usuario.rol}, Remember: ${rememberBool ? 'Sí (7d)' : 'No'}, AccessTokenExp: ${accessExp}, RefreshToken: ${refreshToken ? 'CREADO' : 'NO CREADO'} - Método: localStorage`
        });

        console.log(`✅ Login PWA exitoso para ${usuario.usuario} - Remember: ${rememberBool} - AccessToken expira en: ${accessExp} - RefreshToken: ${refreshToken ? `CREADO (${refreshExp}) - localStorage` : 'NO CREADO'}`);

        // ✅ RESPUESTA PWA COMPATIBLE: Incluir refresh token en la respuesta
        res.json({ 
            token: accessToken,
            refreshToken: refreshToken, // ✅ NUEVO: Enviar refresh token al frontend
            expiresIn: accessExp,
            refreshExpiresIn: refreshToken ? refreshExp : null,
            hasRefreshToken: !!refreshToken,
            usuario: {
                id: usuarioActualizado.id,
                nombre: usuarioActualizado.nombre,
                email: usuarioActualizado.email,
                usuario: usuarioActualizado.usuario,
                rol: usuarioActualizado.rol,
                avatar_key: usuarioActualizado.avatar_key || null,
                ultima_conexion: usuarioActualizado.ultima_conexion || null
            }
        });

    } catch (error) {
        console.error('❌ Error en login:', error);
        
        await auditarAuth(req, {
            accion: 'LOGIN_FAILED',
            usuarioNombre: username,
            estado: 'FALLIDO',
            detallesAdicionales: `Error interno del servidor: ${error.message}`
        });
        
        res.status(500).json({ message: 'Error interno del servidor' });
    }
};

// ✅ REFRESH TOKEN MODIFICADO PARA PWA (localStorage)
exports.refreshToken = async (req, res) => {
    // ✅ PWA: Obtener refresh token del body en lugar de cookies
    const refreshToken = req.body.refreshToken || req.headers['x-refresh-token'];
    
    console.log('🔄 PWA: Intentando renovar token...');
    console.log('🔑 Refresh token recibido:', refreshToken ? 'SÍ (localStorage)' : 'NO');
    
    if (!refreshToken) {
        console.log('❌ No se encontró refresh token en body ni headers');
        return res.status(401).json({ 
            message: 'No autorizado - Refresh token requerido',
            code: 'NO_REFRESH_TOKEN'
        });
    }

    try {
        // ✅ Verificar refresh token
        let decoded;
        try {
            decoded = jwt.verify(refreshToken, process.env.JWT_REFRESH_SECRET);
            console.log('✅ PWA: Refresh token verificado correctamente - Expira en:', new Date(decoded.exp * 1000));
        } catch (jwtError) {
            console.log('❌ Error verificando refresh token:', jwtError.message);
            
            if (jwtError.name === 'TokenExpiredError') {
                return res.status(401).json({ 
                    message: 'Refresh token expirado - Por favor inicia sesión nuevamente',
                    code: 'REFRESH_TOKEN_EXPIRED',
                    expired_at: jwtError.expiredAt
                });
            }
            
            return res.status(403).json({ 
                message: 'Refresh token inválido',
                code: 'REFRESH_TOKEN_INVALID'
            });
        }
        
        // ✅ Verificar que sea un refresh token válido
        if (decoded.type !== 'refresh') {
            console.log('❌ Token no es de tipo refresh');
            return res.status(403).json({ 
                message: 'Token inválido',
                code: 'INVALID_TOKEN_TYPE'
            });
        }
        
        // ✅ Obtener información actualizada del usuario
        const [usuarios] = await db.execute(
            'SELECT * FROM usuarios WHERE id = ? AND activo = 1', 
            [decoded.id]
        );
        
        if (usuarios.length === 0) {
            await auditarAuth(req, {
                accion: 'TOKEN_REFRESH_FAILED',
                usuarioId: decoded.id,
                estado: 'FALLIDO',
                detallesAdicionales: 'PWA Refresh token - Usuario no encontrado o inactivo'
            });
            
            return res.status(404).json({ 
                message: 'Usuario no encontrado o inactivo',
                code: 'USER_NOT_FOUND'
            });
        }

        const usuario = usuarios[0];

        // ✅ Generar nuevo access token
        const { accessToken: accessExp } = getTokenExpiration();
        const tokenPayload = { 
            id: usuario.id, 
            rol: usuario.rol,
            nombre: usuario.nombre,
            usuario: usuario.usuario,
            iat: Math.floor(Date.now() / 1000)
        };

        const newAccessToken = jwt.sign(tokenPayload, process.env.JWT_SECRET, { expiresIn: accessExp });
        
        // ✅ Auditar refresh exitoso
        await auditarAuth(req, {
            accion: 'TOKEN_REFRESH',
            usuarioId: usuario.id,
            usuarioNombre: usuario.nombre,
            estado: 'EXITOSO',
            detallesAdicionales: `PWA Token renovado - AccessToken exp: ${accessExp}, RefreshToken restante: ${Math.round((decoded.exp * 1000 - Date.now()) / (1000 * 60 * 60 * 24))} días`
        });

        console.log(`✅ PWA Token renovado para ${usuario.usuario} - AccessToken expira en: ${accessExp}`);
        
        // ✅ RESPUESTA PWA: Solo access token (refresh token se mantiene igual)
        res.json({ 
            accessToken: newAccessToken,
            expiresIn: accessExp,
            refreshTokenExpiresIn: Math.round((decoded.exp * 1000 - Date.now()) / 1000),
            usuario: {
                id: usuario.id,
                nombre: usuario.nombre,
                usuario: usuario.usuario,
                rol: usuario.rol,
                email: usuario.email
            }
        });

    } catch (error) {
        console.error('❌ Error en PWA refresh token:', error);
        
        await auditarAuth(req, {
            accion: 'TOKEN_REFRESH_FAILED',
            estado: 'FALLIDO',
            detallesAdicionales: `PWA Error en refresh token: ${error.message}`
        });
        
        res.status(500).json({ 
            message: 'Error interno del servidor',
            code: 'INTERNAL_ERROR'
        });
    }
};

// ✅ LOGOUT SIMPLIFICADO PARA PWA
exports.logout = async (req, res) => {
    try {
        // ✅ Auditar logout PWA
        if (req.user) {
            await auditarAuth(req, {
                accion: 'LOGOUT',
                usuarioId: req.user.id,
                usuarioNombre: req.user.nombre,
                estado: 'EXITOSO',
                detallesAdicionales: 'PWA Logout exitoso - localStorage'
            });
            
            console.log(`👋 PWA Logout para ${req.user.usuario}`);
        }
        
        // ✅ PWA: No hay cookies que limpiar, el frontend maneja localStorage
        res.json({ 
            message: 'Logout exitoso',
            timestamp: new Date().toISOString(),
            method: 'localStorage_cleanup'
        });
    } catch (error) {
        console.error('❌ Error en PWA logout:', error);
        res.status(500).json({ message: 'Error interno del servidor' });
    }
};

exports.getProfile = async (req, res) => {
    try {
        const usuarioId = req.user.id;
        
        const [usuarios] = await db.execute(
            `SELECT id, nombre, email, usuario, rol, avatar_key, ultima_conexion
             FROM usuarios
             WHERE id = ? AND activo = 1`,
            [usuarioId]
        );

        if (usuarios.length === 0) {
            return res.status(404).json({ message: 'Usuario no encontrado' });
        }

        res.json({ usuario: usuarios[0] });

    } catch (error) {
        console.error('❌ Error al obtener perfil:', error);
        res.status(500).json({ message: 'Error interno del servidor' });
    }
};

exports.changePassword = async (req, res) => {
    try {
        const usuarioId = req.user.id;
        const { currentPassword, newPassword } = req.body;

        if (!currentPassword || !newPassword) {
            return res.status(400).json({ message: 'Contraseña actual y nueva son obligatorias' });
        }

        if (newPassword.length < 6) {
            return res.status(400).json({ message: 'La nueva contraseña debe tener al menos 6 caracteres' });
        }

        // Verificar contraseña actual
        const [usuarios] = await db.execute(
            'SELECT password FROM usuarios WHERE id = ? AND activo = 1', 
            [usuarioId]
        );
        
        if (usuarios.length === 0) {
            return res.status(404).json({ message: 'Usuario no encontrado' });
        }

        const validPassword = await bcrypt.compare(currentPassword, usuarios[0].password);
        if (!validPassword) {
            await auditarAuth(req, {
                accion: 'PASSWORD_CHANGE',
                usuarioId: req.user.id,
                usuarioNombre: req.user.nombre,
                estado: 'FALLIDO',
                detallesAdicionales: 'Contraseña actual incorrecta'
            });
            
            return res.status(401).json({ message: 'Contraseña actual incorrecta' });
        }

        // Encriptar nueva contraseña
        const hashedNewPassword = await bcrypt.hash(newPassword, 10);

        // Actualizar contraseña
        await db.execute(
            'UPDATE usuarios SET password = ? WHERE id = ?', 
            [hashedNewPassword, usuarioId]
        );

        // ✅ Auditar cambio exitoso de contraseña
        await auditarAuth(req, {
            accion: 'PASSWORD_CHANGE',
            usuarioId: req.user.id,
            usuarioNombre: req.user.nombre,
            estado: 'EXITOSO',
            detallesAdicionales: 'PWA Contraseña actualizada exitosamente'
        });

        res.json({ message: 'Contraseña actualizada exitosamente' });

    } catch (error) {
        console.error('❌ Error al cambiar contraseña:', error);
        
        if (req.user) {
            await auditarAuth(req, {
                accion: 'PASSWORD_CHANGE',
                usuarioId: req.user.id,
                usuarioNombre: req.user.nombre,
                estado: 'FALLIDO',
                detallesAdicionales: `PWA Error interno: ${error.message}`
            });
        }
        
        res.status(500).json({ message: 'Error interno del servidor' });
    }
};