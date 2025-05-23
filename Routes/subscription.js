const express = require('express');
const router = express.Router();
const subscriprionController = require('../controllers/subscriptionController');
const { authenticate, isAdmin } = require('../middlewares/authMiddleware');

// User routes
router.post('/notify-payment',
  authenticate,
subscriprionController.notifyPaymentForProPlus
);

router.get('/pro-plus', authenticate, 
subscriprionController.getProPlusPlan);

// Admin routes
router.post('/confirm-payment',
  authenticate,
  isAdmin,       
subscriprionCcontroller.confirmPaymentForProPlus
);

router.get('/pending-payments',
  authenticate,
  isAdmin,
  subscriprionController.getPendingPayments
);

module.exports = router;
