const express = require('express');
const router = express.Router();
const { authenticate } = require('../middleware/authMiddleware');
const adminAuth = require('../middleware/adminAuth');
const paymentProofController = require('../controllers/paymentProofController');
const multer = require('multer');
const path = require('path');

// Multer setup for Pro+ payment proof uploads (separate directory)
const proPlusStorage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, 'uploads/proPlusProofs'),
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, uniqueSuffix + path.extname(file.originalname));
  }
});
const uploadProPlus = multer({ storage: proPlusStorage });

// Route to initiate the Pro+ payment process and get wallet addresses
router.get('/pro-plus/payment-info', authenticate, paymentProofController.initiateProPlusPayment);

// Route for users to upload Pro+ payment proof
router.post('/pro-plus/upload-proof', authenticate, uploadProPlus.single('proof'), paymentProofController.uploadProPlusPaymentProof);

// Admin routes to view pending Pro+ payments
router.get('/admin/pro-plus/pending', adminAuth, paymentProofController.getPendingProPlusPayments);

// Admin route to update Pro+ payment proof status (approval grants Pro+ access)
router.put('/admin/pro-plus/proofs/:id', adminAuth, paymentProofController.updateProofStatus);

module.exports = router;
