const express = require('express');
const router = express.Router();
const upload = require('../config/fileStorage');
const Authenticate = require('../middlewares/authMiddleware);
const auditLog = require('../middlewares/auditLog');
const kycController = require('../controllers/kycController');

router.post(
  '/submit',
  Authenticate,
  upload.fields([
    { name: 'idImage', maxCount: 1 },
    { name: 'selfieImage', maxCount: 1 }
  ]),
  auditLog('kyc_submission'),
  kycController.upload
);

module.exports = router;

// routes/kyc.js
     router.get('/documents/:file', authMiddleware, (req, res) => {
       const filePath = path.join(__dirname, `../secure-storage/kyc/${req.user.id}/${req.params.file}`);
       if (fs.existsSync(filePath)) {
         res.sendFile(filePath);
       } else {
         res.status(404).send('File not found');
       }
     });