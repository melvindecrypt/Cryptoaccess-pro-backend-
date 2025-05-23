// In your routes/apiRoutes.js
const express = require('express');
const router = express.Router();
const currencyController = require('../controllers/currencyController');
const { authenticate } = require('../middleware/authMiddleware');

// Example with authentication:
router.get('/currencies', authenticate, currencyController.getAllCurrencies);

module.exports = router;
