const AuditLog = require('../models/AuditLog');
const logger = require('../utils/logger');

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
        status: data.status || 'success'
      });

      logger.info(`Audit log created for ${action} action`, {
        logId: logEntry._id,
        ...data
      });

      return logEntry;
    } catch (error) {
      logger.error(`Failed to create audit log: ${error.message}`, {
        action,
        error: error.message
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
}

module.exports = new AuditService();

// Add bulk insert for high-volume operations
async bulkLog(actions) {
  return AuditLog.insertMany(actions);
}