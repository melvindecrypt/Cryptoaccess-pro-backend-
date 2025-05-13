const express = require('express');
const router = express.Router();
const { formatResponse } = require('../utils/helpers');

// Supported payment methods
const SUPPORTED_METHODS = ['MoonPay', 'Transak'];

router.post('/payment-method', async (req, res) => {
  try {
    const { paymentMethod } = req.body;

    // Validate input
    if (!paymentMethod) {
      return res.status(400).json(
        formatResponse(false, 'Payment method is required')
      );
    }

    // Simulate unavailable payment methods
    if (SUPPORTED_METHODS.includes(paymentMethod)) {
      return res.status(503).json(
        formatResponse(false, 
    'Currently unavailable. Contact support',
    { supportEmail: process.env.SUPPORT_EMAIL })
       
    // Handle unknown payment methods
    return res.status(400).json(
      formatResponse(false, 'Invalid payment method')
    );

  } catch (error) {
    console.error('Payment method error:', error);
    return res.status(500).json(
      formatResponse(false, 'Internal server error')
    );
  }
});

module.exports = router;

const express = require('express');
const router = express.Router();
const auth = require('../middleware/authMiddleware');
const adminAuth = require('../middleware/adminAuth');
const paymentProofController = require('../controllers/paymentProofController');
const multer = require('multer');
const path = require('path');

// Multer setup for file uploads
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, 'uploads/paymentProofs'),
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, uniqueSuffix + path.extname(file.originalname));
  }
});
const upload = multer({ storage });

// Route to initiate the access fee process and get wallet addresses
router.get('/access-fee', auth, paymentProofController.initiateAccessFee);

// Route for users to upload payment proof
router.post('/access-fee/upload-proof', auth, upload.single('proof'), paymentProofController.uploadPaymentProof);

// Admin routes to view and update payment proofs
router.get('/admin/payment-proofs', adminAuth, paymentProofController.getAllPaymentProofs);
router.put('/admin/payment-proofs/:id', adminAuth, paymentProofController.updateProofStatus);

module.exports = router;
