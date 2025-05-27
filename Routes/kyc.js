import express from 'express';
import { kycUpload } from '../config/fileStorage.js';
import { authenticate, isAdmin } from '../middlewares/authMiddleware.js';
import auditLog from '../middlewares/auditLog.js';
import kycController from '../controllers/kycController.js';

const router = express.Router();

// Submit KYC Documents
router.post(
  '/submit',
  authenticate,
  kycUpload.fields([
    { name: 'idFront', maxCount: 1 },
    { name: 'idBack', maxCount: 1 },
    { name: 'selfie', maxCount: 1 }, // Selfie is now always expected
  ]),
  auditLog('kyc_submission'),
  kycController.submitKYC
);

// Check KYC Status
router.get('/status', authenticate, kycController.getKYCStatus);

// Update KYC Status (Admin Only)
router.patch('/kyc/status', isAdmin, kycController.updateKYCStatus);

export default router;