const fs = require('fs');
const path = require('path');
const QRCode = require('qrcode');
const qrcodeTerminal = require('qrcode-terminal');
const {
    default: makeWASocket,
    useMultiFileAuthState,
    fetchLatestBaileysVersion
} = require('@whiskeysockets/baileys');
const {
    extractPhoneFromBaileysJid,
    formatJidFromNumber,
    normalizePhoneArgentina,
} = require('./whatsappPhoneUtils');

let sock = null;
let ready = false;
let authDir = process.env.WHATSAPP_AUTH_DIR || './auth_wsp';
let connectionState = 'idle';
let qrDataUrl = null;
let phone = null;
let reconnectAttempts = 0;
let lastError = null;

const MAX_RECONNECT_ATTEMPTS = Number.parseInt(
    String(process.env.WHATSAPP_MAX_RECONNECT_ATTEMPTS ?? '10'),
    10
) || 10;

function getAuthDir() {
    return authDir;
}

function sesionExisteEnDisco(directory = process.env.WHATSAPP_AUTH_DIR || './auth_wsp') {
    try {
        const credsPath = path.join(directory, 'creds.json');
        return fs.existsSync(credsPath);
    } catch {
        return false;
    }
}

function shouldAutoStartOnBoot() {
    const flag = String(process.env.WHATSAPP_AUTO_START ?? 'true').trim().toLowerCase();
    if (['false', '0', 'off', 'no'].includes(flag)) return false;
    return sesionExisteEnDisco();
}

function getReconnectDelayMs() {
    const baseMs = 5000;
    const delay = baseMs * Math.pow(2, Math.max(0, reconnectAttempts - 1));
    return Math.min(delay, 60000);
}

async function limpiarAuthEnDisco(directory = authDir) {
    try {
        await fs.promises.rm(directory, { recursive: true, force: true });
    } catch (_) {
        // noop
    }
}

function resetConnectionFlags() {
    ready = false;
    qrDataUrl = null;
    phone = null;
    connectionState = 'idle';
    reconnectAttempts = 0;
}

function obtenerEstado() {
    return {
        connected: ready && sock !== null,
        hasQR: !!qrDataUrl,
        phone: phone || null,
        reconnecting: connectionState === 'reconnecting',
        reconnectAttempts,
        lastError,
        connectionState,
    };
}

function obtenerQR() {
    if (ready) return null;
    return qrDataUrl || null;
}

function scheduleReconnect(reason, delayMs) {
    if (reconnectAttempts >= MAX_RECONNECT_ATTEMPTS) {
        console.warn(`[WA] Reconexion abortada tras ${reconnectAttempts} intentos (${reason})`);
        connectionState = 'idle';
        lastError = 'reconnect_failed';
        return;
    }

    reconnectAttempts += 1;
    connectionState = 'reconnecting';
    const delay = delayMs ?? getReconnectDelayMs();

    console.warn(
        `[WA] Reconectando en ${delay}ms (intento ${reconnectAttempts}/${MAX_RECONNECT_ATTEMPTS}, ${reason})`
    );

    setTimeout(async () => {
        if (ready) {
            connectionState = 'connected';
            return;
        }

        try {
            sock = null;
            await iniciarWhatsApp(authDir);
        } catch (error) {
            console.error('[WA] Error en reconexion:', error.message);
            connectionState = 'idle';
            lastError = 'reconnect_failed';
        }
    }, delay);
}

async function iniciarWhatsApp(authDirectory = process.env.WHATSAPP_AUTH_DIR || './auth_wsp') {
    if (sock && ready) {
        return { ok: true, message: 'Ya conectado', sock };
    }

    if (
        sock &&
        !ready &&
        ['pairing', 'connecting', 'reconnecting'].includes(connectionState)
    ) {
        return { ok: true, message: 'Conexion o emparejamiento en curso', sock };
    }

    if (sock && connectionState === 'pairing') {
        try {
            sock.end().catch(() => {});
        } catch (_) {
            // noop
        }
        sock = null;
    }

    authDir = authDirectory;
    if (connectionState !== 'reconnecting') {
        qrDataUrl = null;
    }
    connectionState = connectionState === 'reconnecting' ? 'reconnecting' : 'connecting';

    try {
        await fs.promises.mkdir(authDir, { recursive: true });
        const { version } = await fetchLatestBaileysVersion();
        const { state, saveCreds } = await useMultiFileAuthState(authDir);

        sock = makeWASocket({
            auth: state,
            version,
            printQRInTerminal: false,
            syncFullHistory: false,
            markOnlineOnConnect: false,
            shouldIgnoreJid: () => true
        });

        sock.ev.on('creds.update', () => {
            saveCreds();
        });

        sock.ev.on('connection.update', async (update) => {
            const { connection, lastDisconnect, qr } = update;

            if (qr) {
                connectionState = 'pairing';
                try {
                    qrDataUrl = await QRCode.toDataURL(qr, {
                        errorCorrectionLevel: 'M',
                        margin: 2,
                        width: 256
                    });
                } catch (e) {
                    console.error('Error generando QR WhatsApp:', e.message);
                    qrDataUrl = null;
                }

                if (process.env.WHATSAPP_QR_TERMINAL === 'true') {
                    console.log('\n========================================');
                    console.log('CODIGO QR PARA CONECTAR WHATSAPP');
                    console.log('========================================\n');
                    qrcodeTerminal.generate(qr, { small: true });
                }
            }

            if (connection === 'open') {
                console.log('WhatsApp conectado exitosamente');
                ready = true;
                connectionState = 'connected';
                reconnectAttempts = 0;
                lastError = null;
                qrDataUrl = null;
                try {
                    const wid = sock.user?.id || '';
                    phone = extractPhoneFromBaileysJid(wid) || null;
                } catch (_) {
                    phone = null;
                }
                return;
            }

            if (connection === 'close') {
                ready = false;
                const statusCode = lastDisconnect?.error?.output?.statusCode;

                if (statusCode === 515 && connectionState === 'pairing') {
                    if (sock) {
                        try {
                            sock.end().catch(() => {});
                        } catch (_) {
                            // noop
                        }
                        sock = null;
                    }
                    scheduleReconnect('pairing_restart', 2000);
                    return;
                }

                if (statusCode === 401 || statusCode === 403) {
                    sock = null;
                    connectionState = 'idle';
                    phone = null;
                    lastError = 'session_expired';
                    reconnectAttempts = 0;
                    await limpiarAuthEnDisco(authDir);
                    console.warn('[WA] Sesion expirada o invalida; credenciales eliminadas. Escanee un QR nuevo.');
                    return;
                }

                const shouldReconnect =
                    statusCode &&
                    statusCode !== 401 &&
                    statusCode !== 403 &&
                    statusCode !== 515 &&
                    sesionExisteEnDisco(authDir);

                if (shouldReconnect && connectionState !== 'reconnecting') {
                    scheduleReconnect(`disconnect_${statusCode}`);
                } else if (!shouldReconnect) {
                    connectionState = 'idle';
                }
            }
        });

        return { ok: true, message: 'Sesion iniciada; escanee el QR si aparece', sock };
    } catch (error) {
        connectionState = 'idle';
        console.error('Error iniciando WhatsApp:', error);
        throw error;
    }
}

async function iniciarSesion() {
    connectionState = 'pairing';
    reconnectAttempts = 0;
    lastError = null;
    return iniciarWhatsApp(authDir);
}

async function desconectarYLimpiarAuth() {
    if (sock) {
        try {
            await sock.logout();
        } catch (_) {
            try {
                await sock.end();
            } catch (__) {
                // noop
            }
        }
        sock = null;
    }

    resetConnectionFlags();
    lastError = null;

    await limpiarAuthEnDisco(authDir);

    return { ok: true };
}

async function enviarWhatsApp(numero, texto, options = {}) {
    const pedidoId = options.pedidoId;

    if (!sock || !ready) {
        if (!sesionExisteEnDisco(authDir)) {
            throw new Error('WhatsApp no esta conectado. Conectalo desde Configuracion > Integraciones.');
        }

        if (lastError === 'session_expired') {
            throw new Error('WhatsApp requiere un nuevo QR. Conectalo desde Configuracion > Integraciones.');
        }

        if (connectionState === 'reconnecting') {
            throw new Error('WhatsApp esta reconectando. Intenta nuevamente en unos segundos.');
        }

        try {
            await iniciarWhatsApp(authDir);
            let intentos = 0;
            while (!ready && intentos < 15) {
                await new Promise((resolve) => setTimeout(resolve, 1000));
                intentos++;
            }
            if (!ready) {
                if (qrDataUrl) {
                    throw new Error('WhatsApp requiere escanear el QR desde Configuracion > Integraciones.');
                }
                throw new Error('WhatsApp no esta disponible. Verifica la conexion en el panel.');
            }
        } catch (error) {
            console.error('Error iniciando WhatsApp para enviar mensaje:', error);
            throw error instanceof Error
                ? error
                : new Error('WhatsApp no esta disponible. Verifica la conexion.');
        }
    }

    const normalized = normalizePhoneArgentina(numero);
    const jid = formatJidFromNumber(normalized);
    if (!jid || jid === '@s.whatsapp.net') {
        throw new Error('Numero de telefono invalido para WhatsApp');
    }

    const msg = { text: texto };
    const pedidoSuffix = pedidoId ? ` pedidoId=${pedidoId}` : '';
    console.log(`[WA] send to=${jid}${pedidoSuffix}`);
    const result = await sock.sendMessage(jid, msg);
    console.log(`[WA] sent ok to=${jid}${pedidoSuffix}`);
    return result;
}

function estaConectado() {
    return ready && sock !== null;
}

async function cerrarWhatsApp() {
    if (!sock) {
        ready = false;
        connectionState = 'idle';
        return;
    }
    try {
        await sock.end();
        sock = null;
        ready = false;
        qrDataUrl = null;
        phone = null;
        connectionState = 'idle';
        console.log('Conexion de WhatsApp cerrada');
    } catch (error) {
        console.error('Error cerrando WhatsApp:', error);
    }
}

module.exports = {
    iniciarWhatsApp,
    iniciarSesion,
    enviarWhatsApp,
    estaConectado,
    cerrarWhatsApp,
    desconectarYLimpiarAuth,
    obtenerEstado,
    obtenerQR,
    sesionExisteEnDisco,
    shouldAutoStartOnBoot,
    getAuthDir,
    limpiarAuthEnDisco,
};
