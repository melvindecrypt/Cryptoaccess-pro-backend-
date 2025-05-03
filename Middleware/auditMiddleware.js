// middlewares/auditMiddleware.js
const auditService = require('../services/auditService');

const auditLog = (action, options = {}) => {
  return async (req, res, next) => {
    try {
      await auditService.log(action, {
        userId: req.user?._id,
        ip: req.ip,
        userAgent: req.get('User-Agent'),
        ...options
      });
    } catch (error) {
      console.error('Audit middleware error:', error);
    }
    next();
  };
};

module.exports = auditLog;