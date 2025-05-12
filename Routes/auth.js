const express = require('express');
const router = express.Router();
const authController = require('../controllers/authController');


// routes/auth.js
router.post('/register', authController.register);

router.post('/login',authController.login,
  auditLog('login', { 
    metadataFields: ['email'],
    status: req => req.authSuccessful ? 'success' : 'failed'
  });

router.post('/logout', 
  requireAuth,
  auditLog('logout'),
  authController.logout
);

module.exports = router;
