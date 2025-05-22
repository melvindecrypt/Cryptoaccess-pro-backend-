const express = require('express');
const router = express.Router();
const { Authenticate } = require('../middleware/authMiddleware');
const userController = require('../controllers/userController');

// Get user settings (for the /settings page)
router.get('/settings', Authenticate, userController.getSettings);

// Update user settings (for the /settings page - can include language)
router.patch('/settings', Authenticate, userController.updateSettings);

// Get current profile information for editing
router.get('/profile/edit', Authenticate, userController.getProfile);

// Update profile information (name, surname, phone)
router.patch('/profile/edit', Authenticate, userController.updateSettings);

module.exports = router;

// In routes/admin.js (or your chosen route file)
const express = require('express');
const router = express.Router();
const { authenticate } = require('../middleware/authMiddleware');
const { getDashboardData, getProfile, updateSecurity, uploadKycDoc } = require('../controllers/userController');

router.get('/dashboard', authenticate, getDashboardData);
router.get('/users/profile', authenticate, getProfile); // Existing route
router.patch('/users/security', authenticate, updateSecurity); // Existing route
router.post('/users/kyc/upload', authenticate, uploadKycDoc);