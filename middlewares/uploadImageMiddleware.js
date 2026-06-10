const multer = require('multer');

const storage = multer.memoryStorage();

const fileFilter = (req, file, cb) => {
    const allowedTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp'];
    if (allowedTypes.includes(file.mimetype)) {
        cb(null, true);
        return;
    }
    const error = new Error('Tipo de archivo no permitido. Solo JPG, JPEG, PNG, WEBP');
    error.status = 400;
    cb(error, false);
};

const upload = multer({
    storage,
    fileFilter,
    limits: {
        fileSize: 5 * 1024 * 1024,
        files: 1
    }
});

const uploadSingleImage = upload.single('imagen');

module.exports = {
    uploadSingleImage
};
