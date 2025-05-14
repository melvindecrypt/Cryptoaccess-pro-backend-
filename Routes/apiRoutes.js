// In your routes/apiRoutes.js
const express = require('express');
const router = express.Router();
const UserController = require('../controllers/UserController'); // Adjust path as needed
const authMiddleware = require('../middleware/authMiddleware'); // Adjust path as needed

router.get('/dashboard', authMiddleware, UserController.getDashboardData); // Pointing to your existing function

module.exports = router;
