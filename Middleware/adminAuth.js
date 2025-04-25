const jwt = require('jsonwebtoken');
const logger = require('../utils/logger');

module.exports = async (req, res, next) => {
  try {
    const token = req.cookies.adminToken || req.headers.authorization?.split(' ')[1];
    
    if (!token) {
      logger.warn('Admin access attempt without token', { ip: req.ip });
      return res.status(401).json({
        status: 'error',
        code: 'AUTH_REQUIRED',
        message: 'Authentication token missing'
      });
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    
    if (!decoded.isAdmin) {
      logger.warn('Non-admin JWT usage attempt', { userId: decoded.id });
      return res.status(403).json({
        status: 'error',
        code: 'ADMIN_REQUIRED',
        message: 'Administrator privileges required'
      });
    }

    // Verify admin status in database
    const adminUser = await User.findById(decoded.id);
    if (!adminUser?.isAdmin) {
      throw new Error('Admin privileges revoked');
    }

    req.admin = {
      id: decoded.id,
      email: decoded.email,
      permissions: decoded.permissions
    };

    next();
  } catch (error) {
    logger.error(`Admin auth failure: ${error.message}`);
    res.status(401).json({
      status: 'error',
      code: 'AUTH_FAILED',
      message: 'Invalid or expired admin token'
    });
  }
};