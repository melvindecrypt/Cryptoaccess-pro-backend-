const jwt = require('jsonwebtoken');
const logger = require('../utils/logger');
const User = require('../models/User'); // Make sure the path is correct

module.exports = async (req, res, next) => {
  try {
    // Get the token from cookies or Authorization header
    const token = req.cookies.adminToken || req.headers.authorization?.split(' ')[1];

    if (!token) {
      logger.warn('Admin access attempt without token', { ip: req.ip });
      return res.status(401).json({
        status: 'error',
        code: 'AUTH_REQUIRED',
        message: 'Authentication token missing'
      });
    }

    // Verify the token
    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    // Check if the user is admin and has specific permissions
    if (!decoded.isAdmin || !decoded.permissions.includes('admin')) {
      logger.warn('Non-admin or insufficient permissions', { userId: decoded.id });
      return res.status(403).json({
        status: 'error',
        code: 'ADMIN_REQUIRED',
        message: 'Administrator privileges required'
      });
    }

    // Verify admin status in the database
    const adminUser = await User.findById(decoded.id);
    if (!adminUser?.isAdmin || !adminUser?.permissions.includes('admin')) {
      throw new Error('Admin privileges revoked');
    }

    // Attach the admin data to the request object
    req.admin = {
      id: decoded.id,
      email: decoded.email,
      permissions: decoded.permissions
    };

    // Proceed to the next middleware or route handler
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

// middleware/adminAuth.js
  const verifyAdmin = (req, res, next) => {
    const token = req.headers.authorization?.split(" ")[1];
    if (!token) return res.status(401).json({ error: "Unauthorized" });

    jwt.verify(token, process.env.ADMIN_JWT_SECRET, (err, decoded) => {
      if (err || decoded.role !== "admin") {
        return res.status(403).json({ error: "Forbidden" });
      }
      req.adminId = decoded.id;
      next();
    });
  };