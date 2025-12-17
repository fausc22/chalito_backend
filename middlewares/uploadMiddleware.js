/**
 * Middleware de Multer para manejo de archivos en memoria
 * Configurado para aceptar solo imágenes y validar tamaño
 */

const multer = require('multer');
const { uploadImage } = require('../config/cloudinary');

// Configurar almacenamiento en memoria (no guarda archivos en disco)
const storage = multer.memoryStorage();

// Tipos MIME permitidos para imágenes
const allowedMimeTypes = [
    'image/jpeg',
    'image/jpg',
    'image/png',
    'image/webp'
];

// Extensiones permitidas (validación adicional)
const allowedExtensions = ['.jpg', '.jpeg', '.png', '.webp'];

/**
 * Validar tipo de archivo
 */
const fileFilter = (req, file, cb) => {
    // Verificar tipo MIME
    if (allowedMimeTypes.includes(file.mimetype)) {
        cb(null, true);
    } else {
        const error = new Error('Tipo de archivo no permitido. Solo se aceptan imágenes: JPG, JPEG, PNG, WEBP');
        error.status = 400;
        cb(error, false);
    }
};

// Configurar multer
const upload = multer({
    storage: storage,
    fileFilter: fileFilter,
    limits: {
        fileSize: 2 * 1024 * 1024, // 2MB máximo
        files: 1 // Solo un archivo por request
    }
});

/**
 * Middleware para subir una sola imagen
 * El archivo estará disponible en req.file
 */
const uploadSingleImage = upload.single('imagen');

/**
 * Middleware que combina la subida y la carga a Cloudinary
 * Después de este middleware, req.cloudinaryUrl contendrá la URL de la imagen
 */
const uploadToCloudinary = async (req, res, next) => {
    try {
        // Si no hay archivo, continuar sin error (la imagen es opcional en algunos casos)
        if (!req.file) {
            return next();
        }

        // Validar que el archivo tenga contenido
        if (!req.file.buffer || req.file.buffer.length === 0) {
            return res.status(400).json({
                error: 'El archivo de imagen está vacío'
            });
        }

        // Validar tamaño del buffer
        if (req.file.buffer.length > 2 * 1024 * 1024) {
            return res.status(400).json({
                error: 'El archivo excede el tamaño máximo permitido (2MB)'
            });
        }

        console.log(`📤 Subiendo imagen a Cloudinary: ${req.file.originalname} (${(req.file.buffer.length / 1024).toFixed(2)}KB)`);

        // Subir a Cloudinary
        const result = await uploadImage(
            req.file.buffer,
            'articulos', // Carpeta en Cloudinary
            null // Dejar que Cloudinary genere el public_id automáticamente
        );

        // Guardar la URL en el request para uso posterior
        req.cloudinaryUrl = result.secure_url;
        req.cloudinaryPublicId = result.public_id;

        console.log(`✅ Imagen procesada exitosamente: ${req.cloudinaryUrl}`);

        next();
    } catch (error) {
        console.error('❌ Error al procesar imagen:', error);
        res.status(500).json({
            error: 'Error al procesar la imagen',
            message: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
};

/**
 * Middleware para manejar errores de Multer
 */
const handleMulterError = (err, req, res, next) => {
    if (err instanceof multer.MulterError) {
        // Error de Multer (tamaño de archivo, etc.)
        if (err.code === 'LIMIT_FILE_SIZE') {
            return res.status(400).json({
                error: 'El archivo excede el tamaño máximo permitido (2MB)'
            });
        }
        if (err.code === 'LIMIT_FILE_COUNT') {
            return res.status(400).json({
                error: 'Solo se permite un archivo por request'
            });
        }
        return res.status(400).json({
            error: 'Error al procesar el archivo',
            message: err.message
        });
    }
    
    // Otros errores (tipo de archivo, etc.)
    if (err) {
        return res.status(err.status || 400).json({
            error: err.message || 'Error al procesar el archivo'
        });
    }
    
    next();
};

/**
 * Middleware combinado: subida + manejo de errores + Cloudinary
 * Usar este middleware en las rutas que necesiten subir imágenes
 */
const handleImageUpload = [
    uploadSingleImage,
    handleMulterError,
    uploadToCloudinary
];

module.exports = {
    uploadSingleImage,
    uploadToCloudinary,
    handleImageUpload
};

