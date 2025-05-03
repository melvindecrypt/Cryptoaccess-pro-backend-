// utils/helpers.js
const logger = require('./logger');

// Standardized response format
exports.formatResponse = (success, message, data = null) => {
  return {
    success,
    message,
    ...(data && { data })
  };
};

// Validation helpers
exports.validateEmail = (email) => {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
};

exports.validatePassword = (password) => {
  return password.length >= 8 && 
         /[A-Z]/.test(password) && 
         /[0-9]/.test(password);
};

// File handling utilities
exports.generateFilename = (userId, originalName) => {
  const ext = originalName.split('.').pop();
  return `${userId}-${Date.now()}.${ext}`;
};

exports.validateFileType = (file, allowedTypes) => {
  return allowedTypes.includes(file.mimetype);
};

// KYC specific helpers
exports.getKYCStatusColor = (status) => {
  const statusColors = {
    pending: 'orange',
    approved: 'green',
    rejected: 'red',
    expired: 'purple'
  };
  return statusColors[status] || 'gray';
};

// Audit log formatting
exports.formatAuditLog = (action, metadata) => {
  return {
    timestamp: new Date().toISOString(),
    action,
    ...metadata
  };
};

// Error handling
exports.handleError = (res, error, context = 'operation') => {
  logger.error(`Error during ${context}: ${error.message}`);
  return res.status(500).json({
    success: false,
    message: `Failed to complete ${context}`,
    error: process.env.NODE_ENV === 'development' ? error.message : undefined
  });
};

// Email template generators
exports.generateKYCEmailTemplate = (type, data) => {
  const templates = {
    submission: `
      <h2>New KYC Submission</h2>
      <p>User: ${data.email}</p>
      <p>Submitted at: ${new Date().toLocaleString()}</p>
    `,
    approval: `
      <h2>KYC Approved</h2>
      <p>Your documents were approved on ${new Date().toLocaleString()}</p>
    `,
    rejection: `
      <h2>KYC Rejected</h2>
      <p>Reason: ${data.reason || 'Not specified'}</p>
    `
  };
  return templates[type];
};

// Permission checkers
exports.checkAdmin = (user) => {
  return user && user.role === 'admin';
};

// Date formatting
exports.formatDate = (date) => {
  return new Date(date).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  });
};

// Currency formatting
exports.formatCurrency = (amount, currency = 'USD') => {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency
  }).format(amount);
};

module.exports = exports;