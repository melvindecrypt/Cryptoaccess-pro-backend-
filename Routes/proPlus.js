import express from 'express';
import { authenticate } from '../middleware/authMiddleware.js';
import adminAuth from '../middleware/adminAuth.js';
import paymentProofController from '../controllers/paymentProofController.js';
import multer from 'multer';
import path from 'path';

const router = express.Router();

// Multer setup for Pro+ payment proof uploads (separate directory)
const proPlusStorage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, 'uploads/proPlusProofs'),
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1e9);
    cb(null, uniqueSuffix + path.extname(file.originalname));
  },
});
const uploadProPlus = multer({ storage: proPlusStorage });

// Route for users to upload Pro+ payment proof
router.post(
  '/pro-plus/upload-proof',
  authenticate,
  uploadProPlus.single('proof'),
  paymentProofController.uploadProPlusPaymentProof
);

// Admin routes to view pending Pro+ payments
router.get('/admin/pro-plus/pending', adminAuth, paymentProofController.getPendingProPlusPayments);

// Admin route to update Pro+ payment proof status (approval grants Pro+ access)
router.put('/admin/pro-plus/proofs/:id', adminAuth, paymentProofController.updateProofStatus);

// NEW: Admin route to view a specific Pro+ payment proof file
router.get('/admin/pro-plus/proofs/view/:filename', adminAuth, paymentProofController.viewPaymentProofFile);

export default router;