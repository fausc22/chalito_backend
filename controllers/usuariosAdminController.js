const bcrypt = require('bcryptjs');
const db = require('./dbPromise');
const { ROLES } = require('../config/permissions');
const { auditarOperacion, limpiarDatosSensibles } = require('../middlewares/auditoriaMiddleware');

const MIN_PASSWORD_LENGTH = 6;

const mapUsuarioAdmin = (row) => ({
  id: row.id,
  nombre: row.nombre,
  email: row.email,
  usuario: row.usuario,
  rol: row.rol,
  activo: Boolean(row.activo),
  avatar_key: row.avatar_key,
  ultima_conexion: row.ultima_conexion,
  fecha_creacion: row.fecha_creacion,
  fecha_modificacion: row.fecha_modificacion,
});

const SELECT_PUBLIC = `id, nombre, email, usuario, rol, activo, avatar_key, ultima_conexion, fecha_creacion, fecha_modificacion`;

const contarAdminsActivos = async (excluirId = null) => {
  let sql = `SELECT COUNT(*) AS total FROM usuarios WHERE rol = ? AND activo = 1`;
  const params = [ROLES.ADMIN];
  if (excluirId) {
    sql += ' AND id <> ?';
    params.push(excluirId);
  }
  const [rows] = await db.execute(sql, params);
  return Number(rows[0]?.total || 0);
};

const obtenerPorId = async (id) => {
  const [rows] = await db.execute(`SELECT ${SELECT_PUBLIC} FROM usuarios WHERE id = ?`, [id]);
  return rows.length ? rows[0] : null;
};

const listarUsuarios = async (req, res) => {
  try {
    const { page, limit, q, rol, activo } = req.validatedQuery || {
      page: 1,
      limit: 20,
    };

    const pageNum = Math.max(1, Number(page) || 1);
    const limitNum = Math.min(100, Math.max(1, Number(limit) || 20));
    const offsetNum = (pageNum - 1) * limitNum;
    const conditions = [];
    const params = [];

    if (q) {
      conditions.push('(nombre LIKE ? OR email LIKE ? OR usuario LIKE ?)');
      const term = `%${q.trim()}%`;
      params.push(term, term, term);
    }
    if (rol) {
      conditions.push('rol = ?');
      params.push(rol);
    }
    if (activo !== undefined) {
      conditions.push('activo = ?');
      params.push(activo);
    }

    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';

    const [countRows] = await db.execute(
      `SELECT COUNT(*) AS total FROM usuarios ${where}`,
      params
    );
    const total = Number(countRows[0]?.total || 0);

    const [rows] = await db.execute(
      `SELECT ${SELECT_PUBLIC} FROM usuarios ${where}
       ORDER BY activo DESC, nombre ASC
       LIMIT ${limitNum} OFFSET ${offsetNum}`,
      params
    );

    return res.json({
      success: true,
      data: rows.map(mapUsuarioAdmin),
      pagination: {
        page: pageNum,
        limit: limitNum,
        total,
        totalPages: Math.ceil(total / limitNum) || 1,
      },
    });
  } catch (error) {
    console.error('❌ Error listando usuarios:', error);
    return res.status(500).json({ success: false, message: 'Error al listar usuarios' });
  }
};

const obtenerUsuario = async (req, res) => {
  try {
    const { id } = req.validatedParams;
    const usuario = await obtenerPorId(id);
    if (!usuario) {
      return res.status(404).json({ success: false, message: 'Usuario no encontrado' });
    }
    return res.json({ success: true, data: mapUsuarioAdmin(usuario) });
  } catch (error) {
    console.error('❌ Error obteniendo usuario:', error);
    return res.status(500).json({ success: false, message: 'Error al obtener usuario' });
  }
};

const crearUsuario = async (req, res) => {
  try {
    const body = req.validatedBody;
    const email = String(body.email).trim().toLowerCase();
    const usuarioLogin = String(body.usuario).trim();

    const [dupEmail] = await db.execute('SELECT id FROM usuarios WHERE email = ?', [email]);
    if (dupEmail.length) {
      return res.status(409).json({ success: false, message: 'El email ya está en uso' });
    }

    const [dupUser] = await db.execute('SELECT id FROM usuarios WHERE usuario = ?', [usuarioLogin]);
    if (dupUser.length) {
      return res.status(409).json({ success: false, message: 'El nombre de usuario ya está en uso' });
    }

    const hash = await bcrypt.hash(body.password, 10);
    const [result] = await db.execute(
      `INSERT INTO usuarios (nombre, email, usuario, password, rol, activo, avatar_key)
       VALUES (?, ?, ?, ?, ?, 1, ?)`,
      [
        String(body.nombre).trim(),
        email,
        usuarioLogin,
        hash,
        body.rol,
        body.avatar_key ?? null,
      ]
    );

    const creado = await obtenerPorId(result.insertId);

    await auditarOperacion(req, {
      accion: 'CREATE',
      tablaAfectada: 'usuarios',
      registroId: result.insertId,
      datosNuevos: limpiarDatosSensibles(mapUsuarioAdmin(creado)),
      detallesAdicionales: `Usuario creado: ${usuarioLogin} (${body.rol})`,
    });

    return res.status(201).json({
      success: true,
      message: 'Usuario creado correctamente',
      data: mapUsuarioAdmin(creado),
    });
  } catch (error) {
    console.error('❌ Error creando usuario:', error);
    return res.status(500).json({ success: false, message: 'Error al crear usuario' });
  }
};

const actualizarUsuario = async (req, res) => {
  try {
    const { id } = req.validatedParams;
    const body = req.validatedBody;
    const actorId = req.user.id;

    const actual = await obtenerPorId(id);
    if (!actual) {
      return res.status(404).json({ success: false, message: 'Usuario no encontrado' });
    }

    const datosAnteriores = mapUsuarioAdmin(actual);
    const cambios = {};

    if (body.nombre !== undefined) cambios.nombre = String(body.nombre).trim();
    if (body.email !== undefined) cambios.email = String(body.email).trim().toLowerCase();
    if (body.usuario !== undefined) cambios.usuario = String(body.usuario).trim();
    if (body.rol !== undefined) cambios.rol = body.rol;
    if (body.avatar_key !== undefined) cambios.avatar_key = body.avatar_key;

    if (Object.keys(cambios).length === 0) {
      return res.status(400).json({ success: false, message: 'No se enviaron campos para actualizar' });
    }

    if (cambios.rol && actual.rol === ROLES.ADMIN && cambios.rol !== ROLES.ADMIN) {
      const otrosAdmins = await contarAdminsActivos(id);
      if (otrosAdmins === 0 && actual.activo) {
        return res.status(400).json({
          success: false,
          message: 'No se puede quitar el rol ADMIN al último administrador activo',
        });
      }
    }

    if (Number(id) === Number(actorId) && cambios.rol && cambios.rol !== ROLES.ADMIN) {
      const otrosAdmins = await contarAdminsActivos(actorId);
      if (otrosAdmins === 0) {
        return res.status(400).json({
          success: false,
          message: 'No puedes quitarte el rol ADMIN siendo el único administrador activo',
        });
      }
    }

    if (cambios.email) {
      const [rows] = await db.execute('SELECT id FROM usuarios WHERE email = ? AND id <> ?', [
        cambios.email,
        id,
      ]);
      if (rows.length) {
        return res.status(409).json({ success: false, message: 'El email ya está en uso' });
      }
    }

    if (cambios.usuario) {
      const [rows] = await db.execute('SELECT id FROM usuarios WHERE usuario = ? AND id <> ?', [
        cambios.usuario,
        id,
      ]);
      if (rows.length) {
        return res.status(409).json({ success: false, message: 'El nombre de usuario ya está en uso' });
      }
    }

    const campos = Object.keys(cambios);
    const setSql = campos.map((c) => `${c} = ?`).join(', ');
    await db.execute(`UPDATE usuarios SET ${setSql} WHERE id = ?`, [
      ...campos.map((c) => cambios[c]),
      id,
    ]);

    const actualizado = await obtenerPorId(id);

    await auditarOperacion(req, {
      accion: 'UPDATE',
      tablaAfectada: 'usuarios',
      registroId: id,
      datosAnteriores,
      datosNuevos: mapUsuarioAdmin(actualizado),
      detallesAdicionales:
        cambios.rol && cambios.rol !== datosAnteriores.rol
          ? 'Cambio de rol — el usuario afectado debe volver a iniciar sesión'
          : undefined,
    });

    return res.json({
      success: true,
      message: 'Usuario actualizado correctamente',
      data: mapUsuarioAdmin(actualizado),
      requiresRelogin: Boolean(cambios.rol && cambios.rol !== datosAnteriores.rol),
    });
  } catch (error) {
    console.error('❌ Error actualizando usuario:', error);
    return res.status(500).json({ success: false, message: 'Error al actualizar usuario' });
  }
};

const patchActivoUsuario = async (req, res) => {
  try {
    const { id } = req.validatedParams;
    const { activo } = req.validatedBody;
    const actorId = req.user.id;

    const actual = await obtenerPorId(id);
    if (!actual) {
      return res.status(404).json({ success: false, message: 'Usuario no encontrado' });
    }

    if (!activo) {
      if (Number(id) === Number(actorId)) {
        return res.status(400).json({
          success: false,
          message: 'No puedes desactivar tu propia cuenta',
        });
      }
      if (actual.rol === ROLES.ADMIN && actual.activo) {
        const otrosAdmins = await contarAdminsActivos(id);
        if (otrosAdmins === 0) {
          return res.status(400).json({
            success: false,
            message: 'No se puede desactivar al último administrador activo',
          });
        }
      }
    }

    await db.execute('UPDATE usuarios SET activo = ? WHERE id = ?', [activo ? 1 : 0, id]);
    const actualizado = await obtenerPorId(id);

    await auditarOperacion(req, {
      accion: activo ? 'ACTIVATE' : 'DEACTIVATE',
      tablaAfectada: 'usuarios',
      registroId: id,
      datosAnteriores: mapUsuarioAdmin(actual),
      datosNuevos: mapUsuarioAdmin(actualizado),
      detallesAdicionales: activo
        ? 'Usuario reactivado'
        : 'Usuario desactivado — no podrá iniciar sesión',
    });

    return res.json({
      success: true,
      message: activo ? 'Usuario activado' : 'Usuario desactivado',
      data: mapUsuarioAdmin(actualizado),
    });
  } catch (error) {
    console.error('❌ Error cambiando estado activo:', error);
    return res.status(500).json({ success: false, message: 'Error al cambiar estado del usuario' });
  }
};

const resetPasswordUsuario = async (req, res) => {
  try {
    const { id } = req.validatedParams;
    const { password_nueva, confirmar_password } = req.validatedBody;

    if (password_nueva !== confirmar_password) {
      return res.status(400).json({
        success: false,
        message: 'La nueva contraseña y su confirmación no coinciden',
      });
    }

    if (String(password_nueva).length < MIN_PASSWORD_LENGTH) {
      return res.status(400).json({
        success: false,
        message: `La contraseña debe tener al menos ${MIN_PASSWORD_LENGTH} caracteres`,
      });
    }

    const actual = await obtenerPorId(id);
    if (!actual) {
      return res.status(404).json({ success: false, message: 'Usuario no encontrado' });
    }

    const hash = await bcrypt.hash(password_nueva, 10);
    await db.execute('UPDATE usuarios SET password = ? WHERE id = ?', [hash, id]);

    await auditarOperacion(req, {
      accion: 'PASSWORD_RESET',
      tablaAfectada: 'usuarios',
      registroId: id,
      detallesAdicionales: `Contraseña restablecida por admin para ${actual.usuario}`,
    });

    return res.json({
      success: true,
      message: 'Contraseña restablecida correctamente',
    });
  } catch (error) {
    console.error('❌ Error restableciendo contraseña:', error);
    return res.status(500).json({ success: false, message: 'Error al restablecer contraseña' });
  }
};

module.exports = {
  listarUsuarios,
  obtenerUsuario,
  crearUsuario,
  actualizarUsuario,
  patchActivoUsuario,
  resetPasswordUsuario,
};
