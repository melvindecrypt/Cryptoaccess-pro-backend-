import express from 'express';
import authController from '../controllers/authController.js';
import { authenticate } from '../middleware/authMiddleware.js'; // Import authenticate
import auditLog from '../middlewares/auditLog.js';

const router = express.Router();

// Register Route
router.post('/register', authController.register);

// Login Route
router.post(
  '/login',
  authController.login,
  auditLog('login', {
    metadataFields: ['email'],
    status: (req) => (req.authSuccessful ? 'success' : 'failed'),
  })
);

// Logout Route
router.post(
  '/logout',
  authenticate, // Corrected middleware name
  auditLog('logout'),
  authController.logout // Ensure this function is implemented
);

export default router;