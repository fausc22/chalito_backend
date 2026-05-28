const jwt = require('jsonwebtoken');
const { E2E_TEST_USERS } = require('./e2eTestUsers');

const ensureJwtSecret = () => {
  if (!process.env.JWT_SECRET || process.env.JWT_SECRET.length < 32) {
    process.env.JWT_SECRET = 'e2e_test_jwt_secret_minimo_32_chars!!';
  }
};

const signE2eToken = (userKey) => {
  ensureJwtSecret();
  const user = E2E_TEST_USERS[userKey];
  if (!user) {
    throw new Error(`Usuario E2E desconocido: ${userKey}`);
  }

  return jwt.sign(
    {
      id: user.id,
      rol: user.rol,
      nombre: user.nombre,
      usuario: user.usuario,
      iat: Math.floor(Date.now() / 1000),
    },
    process.env.JWT_SECRET,
    { expiresIn: '1h' }
  );
};

const authHeaderFor = (userKey) => `Bearer ${signE2eToken(userKey)}`;

module.exports = {
  signE2eToken,
  authHeaderFor,
  ensureJwtSecret,
};
