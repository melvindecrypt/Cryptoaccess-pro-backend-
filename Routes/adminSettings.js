const express = require('express');
const router = express.Router();
const adminAuth = require('../middleware/adminAuth');
const AdminController = require('../controllers/adminController');

router.get('/wallets', adminAuth, AdminController.getAdminWallets);
router.put('/wallets', adminAuth, AdminController.updateAdminWallets);

router.get('/logs', adminAuth, AdminController.getAuditLogs);

router.get('/notifications', adminAuth, AdminController.getNotifications);
router.post('/notifications', adminAuth, AdminController.sendNotification);

router.get('/settings', adminAuth, AdminController.getSettings);
router.put('/settings', adminAuth, AdminController.updateSettings);

module.exports = router;