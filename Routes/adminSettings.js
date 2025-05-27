const express = require('express');
const router = express.Router();
const adminAuth = require('../middleware/adminAuth');
const adminController = require('../controllers/adminController');

router.get('/wallets', adminAuth, adminController.getAdminWallets);
router.put('/wallets', adminAuth, adminController.updateAdminWallets);

router.get('/logs', adminAuth, adminController.getAuditLogs);

router.get('/notifications', adminAuth, adminController.getNotifications);
router.post('/notifications', adminAuth, adminController.notificationService);

router.get('/settings', adminAuth, adminController.getSettings);
router.put('/settings', adminAuth, adminController.updateSettings);

module.exports = router;



// Get Admin Wallets
router.get('/admin/wallets', adminController.getAdminWallets);

// Update Admin Wallets
router.put('/admin/wallets', adminController.updateAdminWallets);

// Get Audit Logs
router.get('/admin/audit-logs', adminController.getAuditLogs);

// Get Notifications
router.get('/admin/notifications', adminController.getNotifications);

// Admin Notification Service
router.post('/admin/send-notification', adminController.adminNotificationService);

// Get Settings
router.get('/admin/settings', adminController.getSettings);

// Update Settings
router.put('/admin/settings', adminController.updateSettings);
