import logger from './logger.js';
import jwt from 'jsonwebtoken';

// Standardized response format
export const formatResponse = (success, message, data = null) => {
  return {
    success,
    message,
    ...(data && { data }),
  };
};

// Validation helpers
export const validateEmail = (email) => {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
};

export const validatePassword = (password) => {
  return password.length >= 8 && 
         /[A-Z]/.test(password) && 
         /[0-9]/.test(password);
};

// File handling utilities
export const generateFilename = (userId, originalName) => {
  const ext = originalName.split('.').pop();
  return `${userId}-${Date.now()}.${ext}`;
};

export const validateFileType = (file, allowedTypes) => {
  return allowedTypes.includes(file.mimetype);
};

// KYC specific helpers
export const getKYCStatusColor = (status) => {
  const statusColors = {
    pending: 'orange',
    approved: 'green',
    rejected: 'red',
    expired: 'purple',
  };
  return statusColors[status] || 'gray';
};

// Audit log formatting
export const formatAuditLog = (action, metadata) => {
  return {
    timestamp: new Date().toISOString(),
    action,
    ...metadata,
  };
};

// Error handling
export const handleError = (res, error, context = 'operation') => {
  logger.error(`Error during ${context}: ${error.message}`);
  return res.status(500).json({
    success: false,
    message: `Failed to complete ${context}`,
    error: process.env.NODE_ENV === 'development' ? error.message : undefined,
  });
};

// Email template generators
export const generateKYCEmailTemplate = (type, data) => {
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
    `,
  };
  return templates[type];
};

// Permission checkers
export const checkAdmin = (user) => {
  return user && user.role === 'admin';
};

// Date formatting
export const formatDate = (date) => {
  return new Date(date).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
};

// Currency formatting
export const formatCurrency = (amount, currency = 'USD') => {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency,
  }).format(amount);
};

// JWT helper
export const generateJWT = (payload) => {
  return jwt.sign(payload, process.env.JWT_SECRET, {
    algorithm: 'RS256',
    expiresIn: '1h',
  });
};