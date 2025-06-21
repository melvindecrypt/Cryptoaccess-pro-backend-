import express from 'express';
import adminAuth from '../middleware/adminAuth.js';
import authMiddleware from '../middleware/authMiddleware.js';
import adminController from '../controllers/adminController.js';
import adminSettingsController from '../controllers/adminSettingsController.js';

const router = express.Router();

// Admin Wallets
router.get('/wallets', authMiddleware, adminAuth, adminController.getAdminWallets);
router.put('/wallets', authMiddleware, adminAuth, adminController.updateAdminWallets);

// Notifications
router.get('/notifications', authMiddleware, adminAuth, adminController.getNotifications);
router.post('/notifications', authMiddleware, adminAuth, adminController.notificationService);

// Settings
router.get('/settings', authMiddleware, adminAuth, adminController.getSettings);
router.put('/settings', authMiddleware, adminAuth, adminController.updateSettings);

// Exchange Spread Settings
router.get('/exchange/spread-settings', authMiddleware, adminAuth, adminSettingsController.getSpreadSettings);
router.post('/exchange/spread-settings', authMiddleware, adminAuth, adminSettingsController.updateSpreadSettings);

export default router;