// services/notificationService.js
const Notification = require('../models/notification');
const { sendEmail } = require('./emailService');
const logger = require('../utils/logger');
// Optional queue system, if implemented
const { NotificationQueue } = require('./queues');

// Real-time socket tracking map (if you're managing connected users manually)
const connectedUsers = new Map();

class NotificationService {
  async create(userId, type, title, message, metadata = {}) {
    try {
      const notification = await Notification.create({
        user: userId,
        type,
        title,
        message,
        metadata
      });

      this.emitToUser(userId, notification); // Send real-time if possible

      return notification;
    } catch (error) {
      logger.error(`Notification creation failed: ${error.message}`);
    }
  }

  emitToUser(userId, notification) {
    // Real-time via queue system (if you have it)
    if (NotificationQueue) {
      NotificationQueue.add({
        userId,
        event: 'new_notification',
        payload: notification
      });
    }

    // Optional: direct real-time emit if managing sockets yourself
    const userSocket = connectedUsers.get(userId);
    if (userSocket) {
      userSocket.emit("notification", { message: notification.message });
    }
  }

  async sendEmailNotification(userEmail, subject, template, data) {
    try {
      await sendEmail({
        to: userEmail,
        subject,
        template,
        data
      });
    } catch (err) {
      logger.error(`Failed to send email to ${userEmail}: ${err.message}`);
    }
  }
}

module.exports = new NotificationService();