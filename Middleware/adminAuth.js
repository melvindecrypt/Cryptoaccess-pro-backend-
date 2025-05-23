const jwt = require('jsonwebtoken');
const User = require('../models/User');
const logger = require('../utils/logger');

const adminAuth = async (req, res, next) => {
  try {
    // Get token from cookies or Authorization header
    const token = req.cookies.adminToken || req.headers.authorization?.split(' ')[1];

    if (!token) {
      logger.warn('Admin access attempt without token', { ip: req.ip });
      return res.status(401).json({
        status: 'error',
        code: 'AUTH_REQUIRED',
        message: 'Authentication token missing',
      });
    }

    // Use a specific admin JWT secret if available, fallback to default
    const secret = process.env.ADMIN_JWT_SECRET || process.env.JWT_SECRET;
    const decoded = jwt.verify(token, secret);

    // Quick role fallback if no DB check is desired (optional shortcut for internal use)
    if (decoded.role === 'admin' && !decoded.id) {
      req.adminId = decoded.id || 'internal';
      return next();
    }

    // Database validation: ensure user exists and is still an admin
    const adminUser = await User.findById(decoded.id);
    if (!adminUser || !adminUser.isAdmin || !adminUser.permissions.includes('admin')) {
      logger.warn('Admin privileges revoked or insufficient', { userId: decoded.id });
      return res.status(403).json({
        status: 'error',
        code: 'ADMIN_REVOKED',
        message: 'Admin privileges required or revoked',
      });
    }

    // Attach admin data to request for use in routes
    req.admin = {
      id: decoded.id,
      email: decoded.email,
      permissions: decoded.permissions,
    };

    next();

  } catch (error) {
    logger.error(`Admin auth failure: ${error.message}`);
    res.status(401).json({
      status: 'error',
      code: 'AUTH_FAILED',
      message: 'Invalid or expired admin token',
    });
  }
};

module.exports = adminAuth;