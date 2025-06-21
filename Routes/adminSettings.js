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

const express = require('express');
const router = express.Router();

// Import authentication and authorization middleware
const { adminAuth } = require('../middleware/adminAuth'); // Assuming your admin auth middleware
const { authMiddleware } = require('../middleware/authMiddleware'); // Assuming your general auth middleware

// Import the new admin settings controller
const adminSettingsController = require('../controllers/adminSettingsController');

// --- Admin Exchange Spread Settings ---
// All admin routes should use authMiddleware first, then adminAuth
router.get('/exchange/spread-settings', authMiddleware, adminAuth, adminSettingsController.getSpreadSettings);
router.post('/exchange/spread-settings', authMiddleware, adminAuth, adminSettingsController.updateSpreadSettings);

export default router;