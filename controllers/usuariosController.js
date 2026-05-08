const bcrypt = require('bcryptjs');
const db = require('./dbPromise');
const { auditarAuth } = require('../middlewares/auditoriaMiddleware');

const MIN_PASSWORD_LENGTH = 6;

const mapUsuarioPublico = (usuario) => ({
    id: usuario.id,
    nombre: usuario.nombre,
    email: usuario.email,
    usuario: usuario.usuario,
    rol: usuario.rol,
    avatar_key: usuario.avatar_key,
    ultima_conexion: usuario.ultima_conexion
});

const obtenerUsuarioActivoPorId = async (usuarioId) => {
    const [usuarios] = await db.execute(
        `SELECT id, nombre, email, usuario, rol, avatar_key, ultima_conexion
         FROM usuarios
         WHERE id = ? AND activo = 1`,
        [usuarioId]
    );

    return usuarios.length > 0 ? usuarios[0] : null;
};

const getMiPerfil = async (req, res) => {
    try {
        const usuario = await obtenerUsuarioActivoPorId(req.user.id);

        if (!usuario) {
            return res.status(404).json({ message: 'Usuario no encontrado' });
        }

        return res.json({ usuario: mapUsuarioPublico(usuario) });
    } catch (error) {
        console.error('❌ Error al obtener perfil de usuario:', error);
        return res.status(500).json({ message: 'Error interno del servidor' });
    }
};

const actualizarMiPerfil = async (req, res) => {
    try {
        const usuarioId = req.user.id;
        const { nombre, email, usuario, avatar_key } = req.body;

        const usuarioActual = await obtenerUsuarioActivoPorId(usuarioId);
        if (!usuarioActual) {
            return res.status(404).json({ message: 'Usuario no encontrado' });
        }

        const cambios = {};

        if (nombre !== undefined) {
            const nombreLimpio = String(nombre).trim();
            if (!nombreLimpio) {
                return res.status(400).json({ message: 'El nombre no puede estar vacío' });
            }
            cambios.nombre = nombreLimpio;
        }

        if (email !== undefined) {
            const emailLimpio = String(email).trim().toLowerCase();
            if (!emailLimpio) {
                return res.status(400).json({ message: 'El email no puede estar vacío' });
            }
            const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
            if (!emailRegex.test(emailLimpio)) {
                return res.status(400).json({ message: 'Formato de email inválido' });
            }
            cambios.email = emailLimpio;
        }

        if (usuario !== undefined) {
            const usuarioLimpio = String(usuario).trim();
            if (!usuarioLimpio) {
                return res.status(400).json({ message: 'El usuario no puede estar vacío' });
            }
            cambios.usuario = usuarioLimpio;
        }

        if (avatar_key !== undefined) {
            if (avatar_key === null || avatar_key === '') {
                cambios.avatar_key = null;
            } else {
                const avatarKeyLimpio = String(avatar_key).trim();
                if (avatarKeyLimpio.length > 50) {
                    return res.status(400).json({ message: 'avatar_key no puede superar 50 caracteres' });
                }
                cambios.avatar_key = avatarKeyLimpio;
            }
        }

        if (Object.keys(cambios).length === 0) {
            return res.status(400).json({ message: 'No se enviaron campos para actualizar' });
        }

        if (cambios.email) {
            const [emails] = await db.execute(
                'SELECT id FROM usuarios WHERE email = ? AND id <> ?',
                [cambios.email, usuarioId]
            );
            if (emails.length > 0) {
                return res.status(409).json({ message: 'El email ya está en uso' });
            }
        }

        if (cambios.usuario) {
            const [usuarios] = await db.execute(
                'SELECT id FROM usuarios WHERE usuario = ? AND id <> ?',
                [cambios.usuario, usuarioId]
            );
            if (usuarios.length > 0) {
                return res.status(409).json({ message: 'El nombre de usuario ya está en uso' });
            }
        }

        const campos = Object.keys(cambios);
        const valores = campos.map((campo) => cambios[campo]);
        const setSql = campos.map((campo) => `${campo} = ?`).join(', ');

        await db.execute(
            `UPDATE usuarios SET ${setSql} WHERE id = ?`,
            [...valores, usuarioId]
        );

        const usuarioActualizado = await obtenerUsuarioActivoPorId(usuarioId);

        return res.json({
            message: 'Perfil actualizado correctamente',
            usuario: mapUsuarioPublico(usuarioActualizado)
        });
    } catch (error) {
        console.error('❌ Error al actualizar perfil de usuario:', error);
        return res.status(500).json({ message: 'Error interno del servidor' });
    }
};

const cambiarMiPassword = async (req, res) => {
    try {
        const usuarioId = req.user.id;
        const {
            password_actual: passwordActual,
            password_nueva: passwordNueva,
            confirmar_password: confirmarPassword
        } = req.body;

        if (!passwordActual || !passwordNueva || !confirmarPassword) {
            return res.status(400).json({
                message: 'password_actual, password_nueva y confirmar_password son obligatorios'
            });
        }

        if (passwordNueva !== confirmarPassword) {
            return res.status(400).json({ message: 'La nueva contraseña y su confirmación no coinciden' });
        }

        if (String(passwordNueva).length < MIN_PASSWORD_LENGTH) {
            return res.status(400).json({
                message: `La nueva contraseña debe tener al menos ${MIN_PASSWORD_LENGTH} caracteres`
            });
        }

        const [usuarios] = await db.execute(
            'SELECT id, nombre, usuario, password FROM usuarios WHERE id = ? AND activo = 1',
            [usuarioId]
        );

        if (usuarios.length === 0) {
            return res.status(404).json({ message: 'Usuario no encontrado' });
        }

        const usuarioDb = usuarios[0];
        const passwordValida = await bcrypt.compare(passwordActual, usuarioDb.password);
        if (!passwordValida) {
            await auditarAuth(req, {
                accion: 'PASSWORD_CHANGE',
                usuarioId: usuarioDb.id,
                usuarioNombre: usuarioDb.nombre,
                estado: 'FALLIDO',
                detallesAdicionales: 'Cambio por /usuarios/me/password rechazado: contraseña actual incorrecta'
            });

            return res.status(401).json({ message: 'La contraseña actual es incorrecta' });
        }

        const nuevaPasswordHash = await bcrypt.hash(passwordNueva, 10);

        await db.execute(
            'UPDATE usuarios SET password = ? WHERE id = ?',
            [nuevaPasswordHash, usuarioId]
        );

        await auditarAuth(req, {
            accion: 'PASSWORD_CHANGE',
            usuarioId: usuarioDb.id,
            usuarioNombre: usuarioDb.nombre,
            estado: 'EXITOSO',
            detallesAdicionales: 'Cambio de contraseña exitoso por /usuarios/me/password'
        });

        return res.json({ message: 'Contraseña actualizada exitosamente' });
    } catch (error) {
        console.error('❌ Error al cambiar contraseña de usuario:', error);
        return res.status(500).json({ message: 'Error interno del servidor' });
    }
};

module.exports = {
    getMiPerfil,
    actualizarMiPerfil,
    cambiarMiPassword
};
