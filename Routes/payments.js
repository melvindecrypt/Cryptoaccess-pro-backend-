import express from 'express';
import { authenticate } from '../middleware/authMiddleware.js';
import adminAuth from '../middleware/adminAuth.js';
import paymentProofController from '../controllers/paymentProofController.js';
import multer from 'multer';
import path from 'path';

const router = express.Router();

// Multer setup for file uploads
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, 'uploads/paymentProofs'),
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1e9);
    cb(null, uniqueSuffix + path.extname(file.originalname));
  },
});
const upload = multer({ storage });

// User routes
router.get('/access-fee', authenticate, paymentProofController.initiateAccessFee);
router.post('/access-fee/upload-proof', authenticate, upload.single('proof'), paymentProofController.uploadPaymentProof);

// Admin routes
router.get('/admin/payment-proofs', adminAuth, paymentProofController.getAllPaymentProofs);
router.put('/admin/payment-proofs/:id', adminAuth, paymentProofController.updateProofStatus);

// Payment method route (moved to controller)
router.post('/payment-method', paymentProofController.handlePaymentMethod);

export default router;