import express from 'express';
import adminAuth from '../middleware/adminAuth.js';
import adminController from '../controllers/adminController.js';

const router = express.Router();

// Admin Wallets
router.get('/wallets', adminAuth, adminController.getAdminWallets);
router.put('/wallets', adminAuth, adminController.updateAdminWallets);

// Notifications
router.get('/notifications', adminAuth, adminController.getNotifications);
router.post('/notifications', adminAuth, adminController.notificationService);

// Settings
router.get('/settings', adminAuth, adminController.getSettings);
router.put('/settings', adminAuth, adminController.updateSettings);

export default router;