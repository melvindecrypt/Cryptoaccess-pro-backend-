// In your routes/apiRoutes.js
const express = require('express');
const router = express.Router();
const CurrencyController = require('../controllers/currencyController');
const authMiddleware = require('../middleware/authMiddleware');

// Example with authentication:
router.get('/currencies', authMiddleware, currencyController.getAllCurrencies);

module.exports = router;
