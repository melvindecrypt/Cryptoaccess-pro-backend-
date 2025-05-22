// In your routes/apiRoutes.js
const express = require('express');
const router = express.Router();
const CurrencyController = require('../controllers/CurrencyController');
const authMiddleware = require('../middleware/authMiddleware');

// Example with authentication:
router.get('/currencies', authMiddleware, CurrencyController.getAllCurrencies);

module.exports = router;
