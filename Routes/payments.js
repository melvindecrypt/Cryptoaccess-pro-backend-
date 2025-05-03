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