module.exports = {
  apps: [{
    name: 'chalito-backend-test',
    script: 'server.js',
    cwd: '/opt/api-chalito',
    // Mantener instances: 1 — el rate limiter usa memoria local por proceso
    instances: 1,
    autorestart: true,
    watch: false,
    max_memory_restart: '512M',
    env_file: '/opt/api-chalito/.env',
    error_file: '/opt/api-chalito/log/pm2/chalito-test-error.log',
    out_file: '/opt/api-chalito/log/pm2/chalito-test-out.log',
  }]
}
