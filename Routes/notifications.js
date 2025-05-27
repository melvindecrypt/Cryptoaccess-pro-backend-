import express from 'express';
import notification from '../models/notification.js';
import { authenticate } from '../middlewares/authMiddleware.js';

const router = express.Router();

// Get User Notifications
router.get('/', authenticate, async (req, res) => {
  try {
    const notifications = await notification.find({ 
      user: req.user._id 
    }).sort({ createdAt: -1 });

    res.json({
      status: true,
      data: notifications,
    });
  } catch (error) {
    res.status(500).json({
      status: false,
      message: error.message,
    });
  }
});

// Mark Notification as Read
router.patch('/:id/mark-read', authenticate, async (req, res) => {
  try {
    await notification.findByIdAndUpdate(
      req.params.id,
      { isRead: true }
    );
    res.json({ status: true });
  } catch (error) {
    res.status(500).json({
      status: false,
      message: error.message,
    });
  }
});

export default router;