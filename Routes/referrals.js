const express = require('express');
const router = express.Router();
const referralController = require('../controllers/referralController');
const { authenticate } = require('../middleware/authMiddleware');
const { body, validationResult } = require('express-validator');

// GET /api/referrals
router.get('/', authenticate, referralController.getReferralInfo);

// POST /api/referrals/share
router.post(
  '/share',
  authenticate,
  [
    body('recipient_email')
      .optional()
      .isEmail()
      .withMessage('Recipient email must be a valid email address'),
    // Add other validation rules for different sharing methods if needed
  ],
  referralController.shareReferralLink
);

module.exports = router;
