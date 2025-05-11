const jwt = require('jsonwebtoken');
const User = require('../models/User');

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
    res.status(401).json({
      success: false,
      error: 'Authentication failed',
      message: error.message
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

module.exports = { authenticate, isAdmin };

// Add to existing auth middleware
exports.checkDeletionStatus = async (req, res, next) => {
  try {
    // For endpoints that shouldn't work for deleted users
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

// Add this error handler
if (error.name === 'TokenExpiredError') {
  return res.status(401).json({
    code: 'TOKEN_EXPIRED',
    message: 'Token expired. Please refresh your session'
  });
}

const jwt = require('jsonwebtoken');
const User = require('../models/User');

// Middleware to authenticate user by token
const authenticate = async (req, res, next) => {
  try {
    const token = req.cookies.token || req.header('Authorization')?.replace('Bearer ', '');
    
    if (!token) {
      return res.status(401).json({
        success: false,
        error: 'Authentication required',
        message: 'No token provided'
      });
    }

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
    res.status(401).json({
      success: false,
      error: 'Authentication failed',
      message: error.message
    });
  }
};

// Middleware to check if the user is an admin
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

module.exports = { authenticate, isAdmin };