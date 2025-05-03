// services/auditService.js
const AuditLog = require('../models/AuditLog');
const logger = require('../utils/logger');

class AuditService {
  async log(action, {
    userId = null,
    ip = null,
    userAgent = null,
    entityType = null,
    entityId = null,
    metadata = {},
    status = 'success'
  }) {
    try {
      return await AuditLog.create({
        userId,
        ipAddress: ip,
        userAgent,
        action,
        entityType,
        entityId,
        metadata,
        status
      });
    } catch (error) {
      logger.error(`Audit log failed: ${error.message}`);
    }
  }
}

module.exports = new AuditService();