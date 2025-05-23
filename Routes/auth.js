const express = require('express');
const router = express.Router();
const AuthController = require('../controllers/authController');
const { authenticate } = require('../middleware/authMiddleware'); // Import authenticate

// routes/auth.js
router.post('/register', authController.register);

router.post('/login',authController.login,
  auditLog('login', {
    metadataFields: ['email'],
    status: req => req.authSuccessful ? 'success' : 'failed'
  }));

router.post('/logout',
  authenticate, // Corrected middleware name
  auditLog('logout'),
  authController.logout // Ensure this function is implemented
);

module.exports = router;
