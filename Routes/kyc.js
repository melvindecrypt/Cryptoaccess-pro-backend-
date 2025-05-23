const express = require('express');
const router = express.Router();
const { kycUpload } = require('../config/fileStorage');
const { authenticate } = require('../middlewares/authMiddleware');
const auditLog = require('../middlewares/auditLog');
const kycController = require('../controllers/kycController');

router.post(
  '/submit',
  authenticate,
  kycUpload.fields([
    { name: 'idFront', maxCount: 1 },
    { name: 'idBack', maxCount: 1 },
    { name: 'selfie', maxCount: 1 } // Selfie is now always expected
  ]),
  auditLog('kyc_submission'),
  kycController.submitKYC
);

router.get('/status', authenticate, kycController.getKYCStatus);

const { isAdmin } = require('../middlewares/authMiddleware');

router.patch('/kyc/status', isAdmin, kycController.updateKYCStatus);

module.exports = router;
