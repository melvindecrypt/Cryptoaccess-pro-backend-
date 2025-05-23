const express = require('express');
const router = express.Router();
const adminAuth = require('../middleware/adminAuth');
const AdminController = require('../controllers/adminController');

router.get('/wallets', adminAuth, adminController.getAdminWallets);
router.put('/wallets', adminAuth, adminController.updateAdminWallets);

router.get('/logs', adminAuth, adminController.getAuditLogs);

router.get('/notifications', adminAuth, adminController.getNotifications);
router.post('/notifications', adminAuth, adminController.notificationService);

router.get('/settings', adminAuth, adminController.getSettings);
router.put('/settings', adminAuth, adminController.updateSettings);

module.exports = router;