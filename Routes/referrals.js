import express from 'express';
import referralController from '../controllers/referralController.js';
import { authenticate } from '../middleware/authMiddleware.js';
import { body, validationResult } from 'express-validator';

const router = express.Router();

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

export default router;