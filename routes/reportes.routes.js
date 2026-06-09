const express = require('express');
const router = express.Router();
const { getDashboardReportes } = require('../controllers/reportes.controller');
const { readReportes } = require('../middlewares/routeGuards');
const { apiRateLimiter } = require('../middlewares/rateLimitMiddleware');

router.get('/dashboard', apiRateLimiter, ...readReportes, getDashboardReportes);

module.exports = router;
