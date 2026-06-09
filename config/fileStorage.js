/**
 * Almacenamiento de imágenes en el servidor de archivos (files.elchalito.com).
 *
 * Variables de entorno requeridas en .env:
 * - FILES_BASE_URL   (ej: https://files.elchalito.com)
 * - FILES_UPLOAD_PATH (ej: /opt/files)
 */

const fs = require('fs');
const fsp = fs.promises;
const path = require('path');
const crypto = require('crypto');
require('dotenv').config();

const FILES_BASE_URL = (process.env.FILES_BASE_URL || '').replace(/\/$/, '');
const FILES_UPLOAD_PATH = process.env.FILES_UPLOAD_PATH || '';

const missingVars = [];
if (!FILES_BASE_URL) missingVars.push('FILES_BASE_URL');
if (!FILES_UPLOAD_PATH) missingVars.push('FILES_UPLOAD_PATH');

if (missingVars.length > 0) {
    console.warn('⚠️  ADVERTENCIA: Variables de file storage faltantes:', missingVars.join(', '));
    console.warn('   La subida de imágenes NO funcionará hasta configurar estas variables en .env');
}

const getFileServerHostname = () => {
    if (!FILES_BASE_URL) return null;
    try {
        return new URL(FILES_BASE_URL).hostname;
    } catch {
        return null;
    }
};

const extensionFromMimetype = (mimetype) => {
    const map = {
        'image/jpeg': 'jpg',
        'image/jpg': 'jpg',
        'image/png': 'png',
        'image/webp': 'webp'
    };
    return map[mimetype] || 'jpg';
};

const ensureUploadDir = async () => {
    if (!FILES_UPLOAD_PATH) {
        throw new Error('FILES_UPLOAD_PATH no configurado');
    }
    await fsp.mkdir(FILES_UPLOAD_PATH, { recursive: true });
};

/**
 * @param {string} url
 * @returns {string|null} Nombre de archivo si la URL pertenece al file server
 */
const resolvePublicIdFromUrl = (url) => {
    if (!url || typeof url !== 'string') return null;

    const hostname = getFileServerHostname();
    if (!hostname) return null;

    try {
        const parsed = new URL(url);
        if (parsed.protocol !== 'https:' || parsed.hostname !== hostname) {
            return null;
        }
        const filename = path.basename(parsed.pathname);
        return filename || null;
    } catch {
        return null;
    }
};

/**
 * @param {Buffer} fileBuffer
 * @param {Object} options
 * @param {string} [options.mimetype]
 * @returns {Promise<{ secure_url: string, public_id: string, format: string, size: number }>}
 */
const uploadImageToFileServer = async (fileBuffer, options = {}) => {
    if (!FILES_BASE_URL || !FILES_UPLOAD_PATH) {
        throw new Error('File storage no configurado (FILES_BASE_URL / FILES_UPLOAD_PATH)');
    }

    await ensureUploadDir();

    const ext = extensionFromMimetype(options.mimetype);
    const filename = `${crypto.randomUUID()}.${ext}`;
    const absolutePath = path.join(FILES_UPLOAD_PATH, filename);

    await fsp.writeFile(absolutePath, fileBuffer);

    const secure_url = `${FILES_BASE_URL}/${filename}`;
    console.log(`✅ Imagen guardada: ${secure_url}`);

    return {
        secure_url,
        public_id: filename,
        format: ext,
        size: fileBuffer.length
    };
};

/**
 * @param {string} publicId - Nombre de archivo (ej: a1b2c3d4.jpg)
 */
const deleteImageFromFileServer = async (publicId) => {
    if (!publicId || !FILES_UPLOAD_PATH) return;

    const filename = path.basename(String(publicId));
    if (!filename || filename === '.' || filename === '..') return;

    const absolutePath = path.join(FILES_UPLOAD_PATH, filename);

    try {
        await fsp.unlink(absolutePath);
        console.log(`🗑️  Imagen eliminada: ${filename}`);
    } catch (error) {
        if (error.code !== 'ENOENT') {
            console.warn(`⚠️  No se pudo eliminar imagen ${filename}:`, error.message);
        }
    }
};

module.exports = {
    uploadImageToFileServer,
    deleteImageFromFileServer,
    resolvePublicIdFromUrl,
    getFileServerHostname
};
