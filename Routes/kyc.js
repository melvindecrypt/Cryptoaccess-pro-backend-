const express = require('express');
const router = express.Router();
const upload = require('../config/fileStorage');
const Authenticate = require('../middlewares/authMiddleware);
const auditLog = require('../middlewares/auditLog');
const kycController = require('../controllers/kycController');

// Route to submit KYC documents
router.post(
  '/submit',
  Authenticate,
  upload.fields([
    { name: 'idImage', maxCount: 1 },
    { name: 'selfieImage', maxCount: 1 }
  ]),
  auditLog('kyc_submission'),
  kycController.submitKYC
);
 
// New route to get KYC status
router.get('/status', Authenticate, kycController.getKYCStatus);

module.exports = router;
