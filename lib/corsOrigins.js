/**
 * Resolución centralizada de orígenes permitidos (HTTP CORS + Socket.IO).
 */

const DEFAULT_ORIGINS = [
  'http://localhost:3000',
  'http://localhost:3001',
  'https://chalito-carta.vercel.app',
  'https://chalito-beta.vercel.app',
  'https://www.elchalito.com',
  'https://www.gestionelchalito.com',
  'https://elchalito.com',
  'https://gestionelchalito.com'
];

const parseCsvOrigins = (value) => {
  if (!value || typeof value !== 'string') return [];
  return value
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);
};

const dedupeOrigins = (origins) => [...new Set(origins.filter(Boolean))];

/**
 * @returns {string[]} Orígenes HTTP permitidos (lista exacta)
 */
function resolveAllowedOrigins() {
  const fromEnv = [
    process.env.FRONTEND_URL,
    process.env.CARTA_FRONTEND_URL,
    ...parseCsvOrigins(process.env.ALLOWED_ORIGINS)
  ];

  return dedupeOrigins([...DEFAULT_ORIGINS, ...fromEnv]);
}

/**
 * Orígenes para Socket.IO (dev incluye regex localhost).
 * @returns {Array<string|RegExp>}
 */
function resolveSocketOrigins() {
  if (process.env.NODE_ENV === 'development') {
    return ['http://localhost:3000', 'http://localhost:3001', /^http:\/\/localhost:\d+$/];
  }
  return resolveAllowedOrigins();
}

/**
 * @param {string|undefined} origin
 * @returns {boolean}
 */
function isOriginAllowed(origin) {
  if (!origin) return true;
  return resolveAllowedOrigins().includes(origin);
}

module.exports = {
  DEFAULT_ORIGINS,
  resolveAllowedOrigins,
  resolveSocketOrigins,
  isOriginAllowed
};
