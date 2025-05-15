const multer = require('multer');
const path = require('path');
const fs = require('fs');
const logger = require('../utils/logger');

const kycStorage = multer.diskStorage({
  destination: (req, file, cb) => {
    const userId = req.user._id.toString();
    const uploadDir = path.join(__dirname, '../../secure-storage/kyc', userId);
    fs.mkdirSync(uploadDir, { recursive: true });
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname);
    const filename = `${Date.now()}-${file.fieldname}${ext}`; // Filename includes fieldname (idFront, idBack, selfie)
    cb(null, filename);
  }
});

const kycFileFilter = (req, file, cb) => {
  const allowedTypes = ['image/jpeg', 'image/png', 'application/pdf'];
  if (!allowedTypes.includes(file.mimetype)) {
    logger.warn(`Rejected invalid KYC file type: ${file.mimetype}`, {
      userId: req.user?._id,
      action: 'kyc_file_validation',
      status: 'rejected',
      filename: file.originalname,
      mimetype: file.mimetype
    });
    return cb(new Error('Invalid file type. Only JPEG, PNG and PDF are allowed.'), false);
  }
  cb(null, true);
};

exports.kycUpload = multer({
  storage: kycStorage,
  fileFilter: kycFileFilter,
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
