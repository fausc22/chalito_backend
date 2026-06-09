/**
 * Logger opcional para ARCA/AFIP. Si no hay webhook configurado, solo consola.
 */
function sendArcaAfip(msg) {
  if (process.env.DISCORD_WEBHOOK_ARCA) {
    try {
      const axios = require('axios');
      axios.post(process.env.DISCORD_WEBHOOK_ARCA, { content: String(msg).slice(0, 1900) }, { timeout: 5000 }).catch(() => {});
    } catch (_) { /* noop */ }
  }
}

module.exports = { sendArcaAfip };
