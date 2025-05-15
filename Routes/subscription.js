const express = require('express');
const router = express.Router();
const controller = require('../controllers/subscriptionController');
const { authenticate, isAdmin } = require('../middlewares/authMiddleware');

// User routes
router.post('/notify-payment',
  authenticate,
  controller.notifyPaymentForProPlus
);

router.get('/pro-plus', authenticate, controller.getProPlusPlan);

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
