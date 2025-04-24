
const jwt = require('jsonwebtoken');
const logger = require('../utils/logger');

if (!process.env.JWT_SECRET) {
  throw new Error('JWT_SECRET environment variable not configured');
}

const adminAuth = async (req, res, next) => {
  const token = req.headers.authorization?.split(' ')[1];

  try {
    if (!token) {
      logger.warn('Admin access attempt without token', { ip: req.ip });
      return res.status(401).json({
        status: 'error',
        code: 'AUTH_TOKEN_REQUIRED',
        message: 'Authorization token required'
      });
    }

    const decoded = await jwt.verify(token, process.env.JWT_SECRET);

    if (!decoded.isAdmin) {
      logger.warn('Non-admin access attempt', { userId: decoded.userId });
      return res.status(403).json({
        status: 'error',
        code: 'ADMIN_ACCESS_REQUIRED',
        message: 'Administrator privileges required'
      });
    }

    if (decoded.iat < (Date.now() / 1000) - 86400) {
      logger.warn('Stale admin token used', { userId: decoded.userId });
      return res.status(403).json({
        status: 'error',
        code: 'TOKEN_REFRESH_REQUIRED',
        message: 'Token needs refresh'
      });
    }

    req.admin = {
      id: decoded.userId,
      email: decoded.email,
      permissions: decoded.permissions || ['basic']
    };

    logger.info('Admin access granted', { adminId: decoded.userId });
    next();
  } catch (error) {
    const errorType = error.name || 'JWT_ERROR';
    const errorMessage = errorType === 'TokenExpiredError' 
      ? 'Token expired'
      : 'Invalid authentication token';

    logger.error('Admin auth failure', { 
      errorType,
      message: error.message,
      token: token?.slice(-8)
    });

    res.status(403).json({
      status: 'error',
      code: errorType,
      message: errorMessage
    });
  }
};

module.exports = adminAuth;
