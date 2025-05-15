// In routes/user.js or routes/users.js
const express = require('express');
const router = express.Router();
const { Authenticate } = require('../middleware/authMiddleware');
const userController = require('../controllers/userController');

// Get user settings
router.get('/settings', Authenticate, userController.getSettings);

// Update user settings
router.patch('/settings', Authenticate, userController.updateSettings);

module.exports = router;
