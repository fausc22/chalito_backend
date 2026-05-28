const { ROLES } = require('../../../config/permissions');

/** Usuarios ficticios para stub de revalidateUser en E2E (ids altos para no colisionar). */
const E2E_TEST_USERS = {
  admin: {
    id: 990001,
    nombre: 'E2E Admin',
    usuario: 'e2e_admin',
    rol: ROLES.ADMIN,
    activo: 1,
  },
  gerente: {
    id: 990002,
    nombre: 'E2E Gerente',
    usuario: 'e2e_gerente',
    rol: ROLES.GERENTE,
    activo: 1,
  },
  cajero: {
    id: 990003,
    nombre: 'E2E Cajero',
    usuario: 'e2e_cajero',
    rol: ROLES.CAJERO,
    activo: 1,
  },
  cocina: {
    id: 990004,
    nombre: 'E2E Cocina',
    usuario: 'e2e_cocina',
    rol: ROLES.COCINA,
    activo: 1,
  },
};

const E2E_TEST_USERS_BY_ID = Object.fromEntries(
  Object.values(E2E_TEST_USERS).map((u) => [u.id, u])
);

module.exports = {
  E2E_TEST_USERS,
  E2E_TEST_USERS_BY_ID,
};
