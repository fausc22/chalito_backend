module.exports = {
  apps: [{
    name: 'chalito-test',
    script: 'server.js',
    cwd: '/opt/chalito_test',
    // Mantener instances: 1 — el rate limiter usa memoria local por proceso
    instances: 1,
    autorestart: true,
    watch: false,
    max_memory_restart: '512M',
    env_file: '/opt/chalito_test/.env',
    // Timestamp por línea en logs PM2 (hora Argentina vía env.TZ)
    log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
    error_file: '/opt/chalito_test/log/pm2/chalito-test-error.log',
    out_file: '/opt/chalito_test/log/pm2/chalito-test-out.log',
    env: {
      TZ: 'America/Argentina/Buenos_Aires',
    },
  }]
}
