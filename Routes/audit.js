import express from 'express';
import AuditLog from '../models/auditLog.js';
import { authenticate, isAdmin } from '../middlewares/authMiddleware.js';

const router = express.Router();

router.get('/', authenticate, isAdmin, async (req, res) => {
  try {
    const { page = 1, limit = 50, userId, action } = req.query;

    // Validate userId format if provided
    if (userId && !userId.match(/^[0-9a-fA-F]{24}$/)) {
      return res.status(400).json({ status: false, message: 'Invalid userId format' });
    }

    const filter = {};
    if (userId) filter.userId = userId;
    if (action) filter.action = action;

    const logs = await AuditLog.find(filter)
      .populate('userId', 'email')
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(parseInt(limit, 10));

    res.json({
      status: true,
      data: logs,
    });
  } catch (error) {
    res.status(500).json({
      status: false,
      message: error.message,
    });
  }
});

export default router;