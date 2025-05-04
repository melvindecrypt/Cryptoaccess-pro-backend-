// services/notificationService.js
const Notification = require('../models/Notification');
const { sendEmail } = require('./emailService');
const logger = require('../utils/logger');

class NotificationService {
  async create(userId, type, title, message, metadata = {}) {
    try {
      // Save to database
      const notification = await Notification.create({
        user: userId,
        type,
        title,
        message,
        metadata
      });

      // Real-time update via WebSocket
      this.emitToUser(userId, notification);

      return notification;
    } catch (error) {
      logger.error(`Notification failed: ${error.message}`);
    }
  }

  emitToUser(userId, notification) {
    // Implement your WebSocket logic here
    // Example with Socket.IO:
    // io.to(`user_${userId}`).emit('new_notification', notification);
  }

  async sendEmailNotification(userEmail, subject, template, data) {
    await sendEmail({
      to: userEmail,
      subject,
      template,
      data
    });
  }
}

module.exports = new NotificationService();

// Implement priority queue for high-volume notifications
const { NotificationQueue } = require('./queues');
emitToUser(userId, notification) {
  NotificationQueue.add({
    userId,
    event: 'new_notification',
    payload: notification
  });
}

// services/notificationService.js
   const sendRealTimeNotification = (userId, message) => {
     const userSocket = connectedUsers.get(userId);
     if (userSocket) {
       userSocket.emit("notification", { message });
     }
   };
