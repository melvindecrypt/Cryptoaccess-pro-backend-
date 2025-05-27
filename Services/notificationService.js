import Notification from '../models/notification.js';
import { sendEmail } from './emailService.js';
import logger from '../utils/logger.js';
// Optional queue system, if implemented
import { NotificationQueue } from './queues.js';

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
        metadata,
      });

      this.emitToUser(userId, notification); // Send real-time if possible

      return notification;
    } catch (error) {
      logger.error(`Notification creation failed: ${error.message}`);
      throw error; // Ensure the error propagates to the caller
    }
  }

  emitToUser(userId, notification) {
    // Real-time via queue system (if you have it)
    if (NotificationQueue) {
      NotificationQueue.add({
        userId,
        event: 'new_notification',
        payload: notification,
      });
    }

    // Optional: direct real-time emit if managing sockets yourself
    const userSocket = connectedUsers.get(userId);
    if (userSocket) {
      userSocket.emit('notification', { message: notification.message });
    }
  }

  async sendEmailNotification(userEmail, subject, template, data) {
    try {
      await sendEmail({
        to: userEmail,
        subject,
        template,
        data,
      });
    } catch (err) {
      logger.error(`Failed to send email to ${userEmail}: ${err.message}`);
      throw err; // Ensure the error propagates to the caller
    }
  }
}

export default new NotificationService();