/**
 * App mínima con el router productivo /empleados (mismos guards y controllers que server.js).
 */
const createEmpleadosProductionApp = () => {
  const express = require('express');
  const app = express();
  app.use(express.json({ limit: '10mb' }));
  app.use(express.urlencoded({ extended: true }));
  app.use('/empleados', require('../../../routes/empleadosRoutes'));
  return app;
};

module.exports = {
  createEmpleadosProductionApp,
};
