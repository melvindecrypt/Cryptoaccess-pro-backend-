import express from 'express';
import adminAuth from '../middleware/adminAuth.js';
import adminController from '../controllers/adminController.js';

const router = express.Router();

// Audit Logs
router.get('/logs', adminAuth, adminController.getAuditLogs);

export default router;





