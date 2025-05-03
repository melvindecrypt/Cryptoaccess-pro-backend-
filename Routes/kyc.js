const express = require('express');
const router = express.Router();
const upload = require('../config/fileStorage');
const requireAuth = require('../middlewares/requireAuth');
const auditLog = require('../middlewares/auditLog');
const kycController = require('../controllers/kycController');

router.post(
  '/submit',
  requireAuth,
  upload.fields([
    { name: 'idImage', maxCount: 1 },
    { name: 'selfieImage', maxCount: 1 }
  ]),
  auditLog('kyc_submission'),
  kycController.upload
);

module.exports = router;