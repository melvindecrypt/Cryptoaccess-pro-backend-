import express from 'express';
import { authenticate } from '../middleware/authMiddleware.js';
import userController from '../controllers/userController.js';

const router = express.Router();

// Get user settings (for the /settings page)
router.get('/settings', authenticate, userController.getSettings);

// Update user settings (for the /settings page - can include language)
router.patch('/settings', authenticate, userController.updateSettings);

// Get current profile information for editing
router.get('/profile/edit', authenticate, userController.getProfile);

// Update profile information (name, surname, phone)
router.patch('/profile/edit', authenticate, userController.updateSettings);

// Additional routes
router.get('/dashboard', authenticate, userController.getDashboardData);
router.get('/profile', authenticate, userController.getProfile);
router.patch('/security', authenticate, userController.updateSecurity);

export default router;