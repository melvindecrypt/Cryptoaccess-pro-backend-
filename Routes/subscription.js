const express = require('express');
const router = express.Router();
const controller = require('../controllers/subscriptionController');
const { authenticate, isAdmin } = require('../middlewares/authMiddleware');

// User routes
router.post('/notify-payment', 
  authenticate,
  controller.notifyPaymentForProPlus
);

// Admin routes
router.post('/confirm-payment',
  authenticate,
  isAdmin,
  controller.confirmPaymentForProPlus
);

router.get('/pending-payments',
  authenticate,
  isAdmin,
  controller.getPendingPayments
);

module.exports = router;

const express = require('express');
const router = express.Router();
const { authenticate } = require('../middleware/authMiddleware');
const { getProPlusPlan, upgradeProPlus } = require('../controllers/subscriptionController');

router.get('/pro-plus', authenticate, getProPlusPlan);
router.post('/upgrade-pro-plus', authenticate, upgradeProPlus);

module.exports = router;
