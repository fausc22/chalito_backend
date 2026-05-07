const {
    default: makeWASocket,
    useMultiFileAuthState,
    fetchLatestBaileysVersion
} = require('@whiskeysockets/baileys');
const fs = require('fs');
const qrcode = require('qrcode-terminal');

let sock = null;
let ready = false;
let authDir = process.env.WHATSAPP_AUTH_DIR || './auth_wsp';
let reconectando = false;
let emparejando = false;

function normalizarNumeroArg(number) {
    const digits = String(number ?? '').replace(/\D/g, '');
    if (!digits) return '';

    if (digits.startsWith('549') && digits.length >= 12) return digits;
    if (digits.startsWith('54') && digits.length >= 11) return `549${digits.slice(2)}`;
    if (digits.startsWith('9') && digits.length >= 11) return `54${digits}`;
    if (digits.startsWith('0') && digits.length >= 10) return `549${digits.slice(1)}`;

    // Caso común local: 10 dígitos sin prefijo (ej 3511234567)
    if (digits.length === 10) return `549${digits}`;

    return digits;
}

function formatJidFromNumber(number) {
    const normalized = normalizarNumeroArg(number);
    return `${normalized}@s.whatsapp.net`;
}

async function iniciarWhatsApp(authDirectory = process.env.WHATSAPP_AUTH_DIR || './auth_wsp') {
    if (sock && ready) {
        console.log('WhatsApp ya esta conectado');
        return sock;
    }

    if (sock && !ready && !reconectando && !emparejando) {
        console.log('WhatsApp esta conectandose, esperando...');
        return sock;
    }

    if (reconectando && !emparejando) {
        console.log('Ya hay un proceso de reconexion en curso...');
        return sock;
    }

    if (sock && !emparejando) {
        console.log('Ya existe una conexion de WhatsApp, esperando...');
        return sock;
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

        sock.ev.on('connection.update', (update) => {
            const { connection, lastDisconnect, qr } = update;

            if (qr) {
                emparejando = true;
                console.log('\n========================================');
                console.log('CODIGO QR PARA CONECTAR WHATSAPP');
                console.log('========================================');
                console.log('1. Abri WhatsApp en tu telefono');
                console.log('2. Configuracion -> Dispositivos vinculados');
                console.log('3. Toca "Vincular un dispositivo"');
                console.log('4. Escanea este QR');
                console.log('========================================\n');
                qrcode.generate(qr, { small: true });
                console.log('\n========================================');
                console.log('Esperando escaneo del codigo QR...');
                console.log('========================================\n');
            }

            if (connection === 'open') {
                console.log('WhatsApp conectado exitosamente');
                ready = true;
                reconectando = false;
                emparejando = false;
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
                if ((statusCode === 401) || (statusCode === 403)) {
                    sock = null;
                    reconectando = false;
                    emparejando = false;
                    return;
                }

                if (shouldReconnect && !reconectando) {
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

        return sock;
    } catch (error) {
        console.error('Error iniciando WhatsApp:', error);
        throw error;
    }
}

async function enviarWhatsApp(numero, texto) {
    if (!sock || !ready) {
        try {
            await iniciarWhatsApp();
            await new Promise((resolve) => setTimeout(resolve, 2000));
            if (!ready) throw new Error('No se pudo establecer la conexion de WhatsApp');
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
    if (!sock) return;
    try {
        await sock.end();
        sock = null;
        ready = false;
        console.log('Conexion de WhatsApp cerrada');
    } catch (error) {
        console.error('Error cerrando WhatsApp:', error);
    }
}

module.exports = {
    iniciarWhatsApp,
    enviarWhatsApp,
    estaConectado,
    cerrarWhatsApp,
    normalizarNumeroArg
};
