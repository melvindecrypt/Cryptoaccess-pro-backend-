const express = require('express');
const router = express.Router();
const { kycUpload } = require('../config/fileStorage');
const Authenticate = require('../middlewares/authMiddleware');
const auditLog = require('../middlewares/auditLog');
const kycController = require('../controllers/kycController');

router.post(
  '/submit',
  Authenticate,
  kycUpload.fields([
    { name: 'idFront', maxCount: 1 },
    { name: 'idBack', maxCount: 1 },
    { name: 'selfie', maxCount: 1 } // Selfie is now always expected
  ]),
  auditLog('kyc_submission'),
  kycController.submitKYC
);

router.get('/status', Authenticate, kycController.getKYCStatus);

const { isAdmin } = require('../middlewares/authMiddleware'); // Assuming you have admin authentication middleware
const kycController = require('../controllers/kycController');

router.patch('/kyc/status', isAdmin, kycController.updateKYCStatus);

module.exports = router;
