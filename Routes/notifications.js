// routes/notifications.js
const express = require('express');
const router = express.Router();
const Notification = require('../models/Notification');
const { authenticate } = require('../middlewares/authMiddleware');

router.get('/', authenticate, async (req, res) => {
  try {
    const notifications = await Notification.find({ 
      user: req.user._id 
    }).sort({ createdAt: -1 });

    res.json({
      status: true,
      data: notifications
    });
  } catch (error) {
    res.status(500).json({
      status: false,
      message: error.message
    });
  }
});

router.patch('/:id/mark-read', authenticate, async (req, res) => {
  try {
    await Notification.findByIdAndUpdate(
      req.params.id,
      { isRead: true }
    );
    res.json({ status: true });
  } catch (error) {
    res.status(500).json({
      status: false,
      message: error.message
    });
  }
});