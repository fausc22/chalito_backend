/**
 * CONFIGURACIÓN DE CLOUDINARY
 * 
 * Variables de entorno requeridas en .env:
 * - CLOUDINARY_CLOUD_NAME
 * - CLOUDINARY_API_KEY
 * - CLOUDINARY_API_SECRET
 * 
 * Autor: Sistema Chalito Backend
 * Última actualización: 2025
 */

const cloudinary = require('cloudinary').v2;
require('dotenv').config();

// Validar que las variables de entorno estén configuradas
const requiredEnvVars = {
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
    api_key: process.env.CLOUDINARY_API_KEY,
    api_secret: process.env.CLOUDINARY_API_SECRET
};

const missingVars = Object.keys(requiredEnvVars).filter(key => !requiredEnvVars[key]);

if (missingVars.length > 0) {
    console.warn('⚠️  ADVERTENCIA: Variables de Cloudinary faltantes:', missingVars.join(', '));
    console.warn('   La subida de imágenes NO funcionará hasta configurar estas variables en .env');
}

// Configurar Cloudinary
cloudinary.config({
    cloud_name: requiredEnvVars.cloud_name,
    api_key: requiredEnvVars.api_key,
    api_secret: requiredEnvVars.api_secret,
    secure: true // Siempre usar HTTPS
});

/**
 * Subir imagen a Cloudinary desde buffer
 * @param {Buffer} fileBuffer - Buffer del archivo de imagen
 * @param {Object} options - Opciones de subida
 * @returns {Promise<Object>} Resultado de Cloudinary con secure_url y public_id
 */
const uploadImageToCloudinary = (fileBuffer, options = {}) => {
    return new Promise((resolve, reject) => {
        const uploadOptions = {
            folder: options.folder || 'chalito/articulos',
            resource_type: 'image',
            allowed_formats: ['jpg', 'jpeg', 'png', 'webp'],
            transformation: [
                { quality: 'auto' }, // Optimización automática
                { fetch_format: 'auto' } // Formato moderno (WebP cuando sea posible)
            ],
            ...options
        };

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

        uploadStream.end(fileBuffer);
    });
};

/**
 * Eliminar imagen de Cloudinary (opcional para futuras mejoras)
 * @param {string} publicId - public_id de la imagen en Cloudinary
 * @returns {Promise<Object>} Resultado de la eliminación
 */
const deleteImageFromCloudinary = async (publicId) => {
    try {
        const result = await cloudinary.uploader.destroy(publicId);
        console.log(`🗑️  Imagen eliminada de Cloudinary: ${publicId}`);
        return result;
    } catch (error) {
        console.error('❌ Error al eliminar imagen de Cloudinary:', error);
        throw error;
    }
};

module.exports = {
    cloudinary,
    uploadImageToCloudinary,
    deleteImageFromCloudinary
};



