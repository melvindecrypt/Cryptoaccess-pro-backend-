import multer from 'multer';
import path from 'path';
import fs from 'fs';
import logger from '../utils/logger.js';
import { scanFile } from './virusScanner.js';

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

const kycFileFilter = async (req, file, cb) => {
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

  // Virus scanning integration
  try {
    const isClean = await scanFile(file.path);
    if (!isClean) {
      logger.warn(`Rejected potentially malicious KYC file: ${file.originalname}`, {
        userId: req.user?._id,
        action: 'kyc_virus_scanning',
        status: 'rejected',
        filename: file.originalname
      });
      return cb(new Error('File rejected: potential threat'), false);
    }
    cb(null, true);
  } catch (error) {
    logger.error(`Virus scanning failed for file: ${file.originalname}`, {
      userId: req.user?._id,
      action: 'kyc_virus_scanning',
      status: 'error',
      filename: file.originalname,
      error: error.message
    });
    cb(new Error('Error during virus scanning'), false);
  }
};

export const kycUpload = multer({
  storage: kycStorage,
  fileFilter: kycFileFilter,
  limits: {
    fileSize: 5 * 1024 * 1024 // 5MB
  }
});