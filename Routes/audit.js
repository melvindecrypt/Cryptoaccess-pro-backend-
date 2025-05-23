// routes/audit.js
const express = require('express');
const router = express.Router();
const AuditLog = require('../models/auditLog');
const { authenticate, isAdmin } = require('../middlewares/authMiddleware');

router.get('/', authenticate, isAdmin, async (req, res) => {
  try {
    const { page = 1, limit = 50, userId, action } = req.query;
    
    const filter = {};
    if (userId) filter.userId = userId;
    if (action) filter.action = action;

    const logs = await AuditLog.find(filter)
      .populate('userId', 'email')
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(parseInt(limit));

    res.json({
      status: true,
      data: logs
    });
  } catch (error) {
    res.status(500).json({
      status: false,
      message: error.message
    });
  }
});

if (userId && !userId.match(/^[0-9a-fA-F]{24}$/)) {
  return res.status(400).json({ status: false, message: 'Invalid userId format' });
}