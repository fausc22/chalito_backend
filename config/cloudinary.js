/**
 * Configuración de Cloudinary para gestión de imágenes
 * 
 * Variables de entorno requeridas:
 * - CLOUDINARY_NAME: Nombre de la cuenta de Cloudinary
 * - CLOUDINARY_KEY: API Key de Cloudinary
 * - CLOUDINARY_SECRET: API Secret de Cloudinary
 * 
 * Estas variables deben configurarse en Render en la sección de Environment Variables
 */

const cloudinary = require('cloudinary').v2;
require('dotenv').config();

// Validar que las variables de entorno estén configuradas
const requiredEnvVars = ['CLOUDINARY_NAME', 'CLOUDINARY_KEY', 'CLOUDINARY_SECRET'];
const missingVars = requiredEnvVars.filter(varName => !process.env[varName]);

if (missingVars.length > 0) {
    console.warn(`⚠️  Advertencia: Variables de entorno de Cloudinary faltantes: ${missingVars.join(', ')}`);
    console.warn('   El servicio de imágenes no funcionará hasta que se configuren estas variables.');
}

// Configurar Cloudinary
cloudinary.config({
    cloud_name: process.env.CLOUDINARY_NAME,
    api_key: process.env.CLOUDINARY_KEY,
    api_secret: process.env.CLOUDINARY_SECRET,
    secure: true // Usar HTTPS
});

/**
 * Subir imagen a Cloudinary desde buffer en memoria
 * @param {Buffer} imageBuffer - Buffer de la imagen
 * @param {string} folder - Carpeta en Cloudinary (ej: 'articulos')
 * @param {string} publicId - ID público opcional (si no se proporciona, Cloudinary genera uno)
 * @returns {Promise<Object>} Resultado de la subida con secure_url
 */
const uploadImage = async (imageBuffer, folder = 'articulos', publicId = null) => {
    return new Promise((resolve, reject) => {
        const uploadOptions = {
            folder: folder,
            resource_type: 'image',
            format: 'auto', // Cloudinary detecta el formato automáticamente
            quality: 'auto', // Optimización automática de calidad
            fetch_format: 'auto' // Conversión automática a formato moderno (WebP cuando sea posible)
        };

        // Si se proporciona un publicId, agregarlo
        if (publicId) {
            uploadOptions.public_id = publicId;
        }

        const uploadStream = cloudinary.uploader.upload_stream(
            uploadOptions,
            (error, result) => {
                if (error) {
                    console.error('❌ Error al subir imagen a Cloudinary:', error);
                    reject(error);
                } else {
                    console.log(`✅ Imagen subida exitosamente: ${result.secure_url}`);
                    resolve(result);
                }
            }
        );

        // Subir el buffer directamente
        uploadStream.end(imageBuffer);
    });
};

/**
 * Eliminar imagen de Cloudinary (opcional, para limpieza futura)
 * @param {string} publicId - ID público de la imagen en Cloudinary
 * @returns {Promise<Object>} Resultado de la eliminación
 */
const deleteImage = async (publicId) => {
    return new Promise((resolve, reject) => {
        cloudinary.uploader.destroy(publicId, (error, result) => {
            if (error) {
                console.error('❌ Error al eliminar imagen de Cloudinary:', error);
                reject(error);
            } else {
                console.log(`✅ Imagen eliminada de Cloudinary: ${publicId}`);
                resolve(result);
            }
        });
    });
};

module.exports = {
    cloudinary,
    uploadImage,
    deleteImage
};

