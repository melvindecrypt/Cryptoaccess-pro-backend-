import AuditLog from '../models/auditLog.js';
import logger from '../utils/logger.js';

class AuditService {
  async log(action, data) {
    try {
      const logEntry = await AuditLog.create({
        action,
        userId: data.userId,
        entityType: data.entityType,
        entityId: data.entityId,
        ipAddress: data.ip,
        userAgent: data.userAgent,
        metadata: data.metadata,
        status: data.status || 'success',
      });

      logger.info(`Audit log created for ${action} action`, {
        logId: logEntry._id,
        ...data,
      });

      return logEntry;
    } catch (error) {
      logger.error(`Failed to create audit log: ${error.message}`, {
        action,
        error: error.message,
      });
      throw error;
    }
  }

  async getLogs(filter = {}, options = {}) {
    try {
      return await AuditLog.find(filter)
        .sort({ createdAt: -1 })
        .skip(options.skip || 0)
        .limit(options.limit || 50);
    } catch (error) {
      logger.error(`Failed to fetch audit logs: ${error.message}`);
      throw error;
    }
  }

  // ✅ FIXED: Now bulkLog is inside the class and valid
  async bulkLog(actions) {
    try {
      return await AuditLog.insertMany(actions);
    } catch (error) {
      logger.error(`Failed to bulk insert audit logs: ${error.message}`);
      throw error;
    }
  }
}

export default new AuditService();