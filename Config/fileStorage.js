const multer = require('multer');
const path = require('path');
const logger = require('../utils/logger');

const storage = multer.diskStorage({
  destination: './uploads/kyc/',
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname);
    const filename = `${req.user._id}-${file.fieldname}-${Date.now()}${ext}`;
    
    logger.info(`KYC file upload initiated`, {
      userId: req.user._id,
      action: 'kyc_file_upload',
      metadata: {
        originalName: file.originalname,
        newFilename: filename,
        fileType: file.mimetype
      }
    });

    cb(null, filename);
  }
});

const fileFilter = (req, file, cb) => {
  const allowedTypes = ['image/jpeg', 'image/png', 'application/pdf'];
  if (!allowedTypes.includes(file.mimetype)) {
    logger.warn(`Rejected invalid file type: ${file.mimetype}`, {
      userId: req.user?._id,
      action: 'kyc_file_validation',
      status: 'rejected'
    });
    return cb(new Error('Invalid file type. Only JPEG, PNG and PDF are allowed.'), false);
  }
  cb(null, true);
};

module.exports = multer({
  storage,
  fileFilter,
  limits: {
    fileSize: 5 * 1024 * 1024 // 5MB
  }
});

// Add virus scanning integration
const { scanFile } = require('./virusScanner');
fileFilter: async (req, file, cb) => {
  const isClean = await scanFile(file.path);
  if (!isClean) return cb(new Error('File rejected: potential threat'));
}

// config/fileStorage.js
   const multer = require('multer');
   const path = require('path');

   const storage = multer.diskStorage({
     destination: (req, file, cb) => {
       const dir = `./secure-storage/kyc/${req.user.id}`;
       require('fs').mkdirSync(dir, { recursive: true });
       cb(null, dir);
     },
     filename: (req, file, cb) => {
       cb(null, `${Date.now()}-${file.originalname}`);
     }
   });

   exports.kycUpload = multer({ storage });