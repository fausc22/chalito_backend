const { E2E_TEST_USERS_BY_ID } = require('./e2eTestUsers');

let originalExecute = null;

const isUsuarioRevalidateQuery = (query) => {
  const normalized = String(query).replace(/\s+/g, ' ').toUpperCase();
  return normalized.includes('FROM USUARIOS WHERE ID = ?');
};

const installDbUserStub = () => {
  const db = require('../../../controllers/dbPromise');

  if (!originalExecute) {
    originalExecute = db.execute.bind(db);
  }

  db.execute = async (query, params = []) => {
    if (isUsuarioRevalidateQuery(query)) {
      const user = E2E_TEST_USERS_BY_ID[params[0]];
      if (!user) {
        return [[]];
      }
      return [[
        {
          id: user.id,
          nombre: user.nombre,
          usuario: user.usuario,
          email: `${user.usuario}@e2e.test`,
          rol: user.rol,
          activo: user.activo,
          avatar_key: null,
        },
      ]];
    }
    return originalExecute(query, params);
  };
};

const uninstallDbUserStub = () => {
  const db = require('../../../controllers/dbPromise');
  if (originalExecute) {
    db.execute = originalExecute;
    originalExecute = null;
  }
};

const closeDbPool = async () => {
  try {
    const db = require('../../../controllers/dbPromise');
    if (typeof db.end === 'function') {
      await db.end();
    }
  } catch {
    // ignorar en teardown
  }
};

module.exports = {
  installDbUserStub,
  uninstallDbUserStub,
  closeDbPool,
};
