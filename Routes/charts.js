const express = require('express');
const router = express.Router();
const { authenticate } = require('../middleware/authMiddleware');
const { getChartData } = require('../controllers/chartController');

router.get('/', authenticate, getChartData);

module.exports = router;
