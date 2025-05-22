const jwt = require('jsonwebtoken');
const User = require('../models/user');

const authenticate = async (req, res, next) => {
  try {
    const token = req.cookies.token ||
                 req.header('Authorization')?.replace('Bearer ', '');

    if (!token) {
      return res.status(401).json({
        success: false,
        error: 'Authentication required',
        message: 'No token provided'
      });
    }

    try {
      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      const user = await User.findById(decoded.id).select('-password');

      if (!user) {
        return res.status(401).json({
          success: false,
          error: 'Invalid token',
          message: 'User not found'
        });
      }

      req.user = user;
      next();
    } catch (error) {
      if (error.name === 'TokenExpiredError') {
        return res.status(401).json({
          success: false,
          error: 'Token expired',
          message: 'Token has expired. Please log in again.'
        });
      }
      console.error('JWT Verification Error:', error); // Consider more robust logging
      return res.status(401).json({
        success: false,
        error: 'Authentication failed',
        message: 'Invalid token.' // More generic message for production
      });
    }
  } catch (error) {
    console.error('Authentication Middleware Error:', error);
    res.status(401).json({
      success: false,
      error: 'Authentication failed',
      message: 'An error occurred during authentication.'
    });
  }
};

const isAdmin = (req, res, next) => {
  if (!req.user?.isAdmin) {
    return res.status(403).json({
      success: false,
      error: 'Forbidden',
      message: 'Admin privileges required'
    });
  }
  next();
};

const checkDeletionStatus = async (req, res, next) => {
  try {
    if (req.user?.isDeleted) {
      return res.status(410).json({
        success: false,
        message: 'Account no longer exists'
      });
    }
    next();
  } catch (error) {
    next(error);
  }
};

module.exports = { authenticate, isAdmin, checkDeletionStatus };
