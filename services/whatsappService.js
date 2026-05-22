const fs = require('fs');
const path = require('path');
const QRCode = require('qrcode');
const qrcodeTerminal = require('qrcode-terminal');
const {
    default: makeWASocket,
    useMultiFileAuthState,
    fetchLatestBaileysVersion
} = require('@whiskeysockets/baileys');

let sock = null;
let ready = false;
let authDir = process.env.WHATSAPP_AUTH_DIR || './auth_wsp';
let reconectando = false;
let emparejando = false;
let qrDataUrl = null;
let phone = null;

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

function normalizarNumeroArg(number) {
    const digits = String(number ?? '').replace(/\D/g, '');
    if (!digits) return '';

    if (digits.startsWith('549') && digits.length >= 12) return digits;
    if (digits.startsWith('54') && digits.length >= 11) return `549${digits.slice(2)}`;
    if (digits.startsWith('9') && digits.length >= 11) return `54${digits}`;
    if (digits.startsWith('0') && digits.length >= 10) return `549${digits.slice(1)}`;
    if (digits.length === 10) return `549${digits}`;

    return digits;
}

function formatJidFromNumber(number) {
    const normalized = normalizarNumeroArg(number);
    return `${normalized}@s.whatsapp.net`;
}

function obtenerEstado() {
    return {
        connected: ready && sock !== null,
        hasQR: !!qrDataUrl,
        phone: phone || null
    };
}

function obtenerQR() {
    if (ready) return null;
    return qrDataUrl || null;
}

async function iniciarWhatsApp(authDirectory = process.env.WHATSAPP_AUTH_DIR || './auth_wsp') {
    if (sock && ready) {
        return { ok: true, message: 'Ya conectado', sock };
    }

    if (sock && !ready && !reconectando && !emparejando) {
        return { ok: true, message: 'Conexión o emparejamiento en curso', sock };
    }

    if (reconectando && !emparejando) {
        return { ok: true, message: 'Reconexión en curso', sock };
    }

    if (sock && !emparejando) {
        return { ok: true, message: 'Conexión en curso', sock };
    }

    if (sock && emparejando) {
        try {
            sock.end().catch(() => {});
        } catch (_) {
            // noop
        }
        sock = null;
    }

    authDir = authDirectory;
    qrDataUrl = null;

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
                emparejando = true;
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
                reconectando = false;
                emparejando = false;
                qrDataUrl = null;
                try {
                    const wid = sock.user?.id || '';
                    phone = wid.split('@')[0] || null;
                } catch (_) {
                    phone = null;
                }
                return;
            }

            if (connection === 'close') {
                ready = false;
                const statusCode = lastDisconnect?.error?.output?.statusCode;

                if (statusCode === 515 && emparejando) {
                    if (sock) {
                        try {
                            sock.end().catch(() => {});
                        } catch (_) {
                            // noop
                        }
                        sock = null;
                    }
                    reconectando = true;
                    setTimeout(async () => {
                        if (!ready && emparejando) {
                            try {
                                await iniciarWhatsApp(authDir);
                            } catch (error) {
                                console.error('Error al reiniciar despues del emparejamiento:', error.message);
                                reconectando = false;
                                emparejando = false;
                            }
                        }
                    }, 2000);
                    return;
                }

                const shouldReconnect = statusCode && statusCode !== 401 && statusCode !== 403 && statusCode !== 515;
                if (statusCode === 401 || statusCode === 403) {
                    sock = null;
                    reconectando = false;
                    emparejando = false;
                    phone = null;
                    return;
                }

                if (shouldReconnect && !reconectando && sesionExisteEnDisco(authDir)) {
                    reconectando = true;
                    emparejando = false;
                    setTimeout(async () => {
                        if (!ready) {
                            try {
                                sock = null;
                                await iniciarWhatsApp(authDir);
                            } catch (error) {
                                console.error('Error en reconexion:', error.message);
                                reconectando = false;
                            }
                        } else {
                            reconectando = false;
                        }
                    }, 5000);
                } else {
                    reconectando = false;
                    emparejando = false;
                }
            }
        });

        return { ok: true, message: 'Sesión iniciada; escanee el QR si aparece', sock };
    } catch (error) {
        console.error('Error iniciando WhatsApp:', error);
        throw error;
    }
}

async function iniciarSesion() {
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
    ready = false;
    qrDataUrl = null;
    phone = null;
    reconectando = false;
    emparejando = false;

    try {
        await fs.promises.rm(authDir, { recursive: true, force: true });
    } catch (_) {
        // noop
    }

    return { ok: true };
}

async function enviarWhatsApp(numero, texto) {
    if (!sock || !ready) {
        if (!sesionExisteEnDisco(authDir)) {
            throw new Error('WhatsApp no esta conectado. Conectalo desde Configuracion > Integraciones.');
        }
        try {
            await iniciarWhatsApp(authDir);
            let intentos = 0;
            while (!ready && intentos < 15) {
                await new Promise((resolve) => setTimeout(resolve, 1000));
                intentos++;
            }
            if (!ready) {
                throw new Error('WhatsApp no esta disponible. Verifica la conexion en el panel.');
            }
        } catch (error) {
            console.error('Error iniciando WhatsApp para enviar mensaje:', error);
            throw new Error('WhatsApp no esta disponible. Verifica la conexion.');
        }
    }

    const jid = formatJidFromNumber(numero);
    if (!jid || jid === '@s.whatsapp.net') {
        throw new Error('Numero de telefono invalido para WhatsApp');
    }

    const msg = { text: texto };
    console.log(`Enviando WhatsApp a ${numero}...`);
    const result = await sock.sendMessage(jid, msg);
    console.log(`WhatsApp enviado exitosamente a ${numero}`);
    return result;
}

function estaConectado() {
    return ready && sock !== null;
}

async function cerrarWhatsApp() {
    if (!sock) {
        ready = false;
        return;
    }
    try {
        await sock.end();
        sock = null;
        ready = false;
        qrDataUrl = null;
        phone = null;
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
    normalizarNumeroArg
};
