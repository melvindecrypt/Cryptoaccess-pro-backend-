import express from 'express';
import mongoose from 'mongoose';
import dotenv from 'dotenv';
import cookieParser from 'cookie-parser';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import { Server } from 'socket.io';
import jwt from 'jsonwebtoken';
import auditService from './services/auditService.js'; // Assuming you have an audit service
import multer from 'multer';
import logger from './utils/logger.js';
import { formatResponse } from './utils/helpers.js';
import fs from 'fs';
import path from 'path';

// Load environment variables
dotenv.config();

// Ensure upload directories exist
const uploadDirs = ['./uploads/kyc', './uploads/proPlusProofs'];
uploadDirs.forEach((dir) => {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
    logger.info(`Created upload directory: ${dir}`);
  }
});

// Initialize Express app
const app = express();
const server = require('http').createServer(app); // For Socket.IO

// ================== Socket.IO Setup ==================
const io = new Server(server, {
  cors: {
    origin: process.env.CLIENT_URL,
    methods: ['GET', 'POST'],
  },
});

io.on('connection', (socket) => {
  console.log('Client connected');

  socket.on('authenticate', (token) => {
    try {
      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      socket.join(`user_${decoded.id}`);
    } catch (error) {
      socket.disconnect();
    }
  });
});

// ================== Middleware ==================
// Security Middleware
app.use(
  helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'", "'unsafe-inline'"],
        styleSrc: ["'self'", "'unsafe-inline'"],
        imgSrc: ["'self'", 'data:', 'https://*.stripe.com'],
        connectSrc: ["'self'", 'https://api.stripe.com '],
      },
    },
  })
);

app.use(
  cors({
    origin: process.env.CLIENT_URL,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'],
    allowedHeaders: ['Content-Type', 'Authorization'],
    credentials: true,
  })
);

app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  next();
});

// Rate Limiting
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // Limit each IP to 100 requests per windowMs
  message: formatResponse(false, 'Too many requests from this IP'),
});
app.use('/api/', limiter);

// Body Parsing
app.use(express.json({ limit: '10kb' }));
app.use(express.urlencoded({ extended: true, limit: '10kb' }));
app.use(cookieParser());

// Request Logging
app.use((req, res, next) => {
  logger.info(`${req.method} ${req.originalUrl}`);
  auditService.log('api_request', {
    ip: req.ip,
    userAgent: req.get('User-Agent'),
    metadata: {
      method: req.method,
      path: req.path,
      params: req.params,
      query: req.query,
    },
  });
  next();
});

// Serve static files
app.use('/kyc', express.static('uploads/kyc'));

// ================== Database Connection ==================
import('./config/db.js')();

// ================== Route Imports ==================
const adminRoutes = await import('./routes/admin.js');
const authRoutes = await import('./routes/auth.js');
const auditRoutes = await import('./routes/audit.js');
const paymentRoutes = await import('./routes/payments.js');
const walletRoutes = await import('./routes/wallets.js'); // Corrected typo: wallets
const transferRoutes = await import('./routes/walletTransfer.js');
const investmentRoutes = await import('./routes/investments.js');
const subscriptionRoutes = await import('./routes/subscription.js');
const adminSettingsRoutes = await import('./routes/adminSettings.js'); // Assuming this path is correct
const chartRoutes = await import('./routes/charts.js');
const exchangeRoutes = await import('./routes/exchange.js');
const withdrawalRoutes = await import('./routes/withdrawal.js'); // Import the new withdrawal routes
const currencyRoutes = await import('./routes/currency.js');
const kycRoutes = await import('./routes/kyc.js');
const notificationRoutes = await import('./routes/notifications.js');
const propPlusRoutes = await import('./routes/propPlus.js');
const referralRoutes = await import('./routes/referrals.js');
const userRoutes = await import('./routes/user.js');

// ================== Route Definitions ==================
app.use('/api/admin', adminRoutes.default);
app.use('/api/auth', authRoutes.default);
app.use('/api/audit', auditRoutes.default);
app.use('/api/payments', paymentRoutes.default);
app.use('/api/wallets', walletRoutes.default);
app.use('/api/transfers', transferRoutes.default);
app.use('/api/investments', investmentRoutes.default);
app.use('/api/subscriptions', subscriptionRoutes.default);
app.use('/api/admin/settings', adminSettingsRoutes.default); // Mount admin settings routes
app.use('/api/charts', chartRoutes.default);
app.use('/api/exchange', exchangeRoutes.default);
app.use('/api/withdraw', withdrawalRoutes.default);
app.use('/api/currency', currencyRoutes.default);
app.use('/api/kyc', kycRoutes.default);
app.use('/api/notifications', notificationRoutes.default);
app.use('/api/pro', proPlusRoutes.default);
app.use('/api/referrals', referralRoutes.default);
app.use('/api/user', userRoutes.default);

// ================== HTTPS Redirection ==================
if (process.env.NODE_ENV === 'production') {
  app.use((req, res, next) => {
    if (req.headers['x-forwarded-proto'] !== 'https') {
      return res.redirect(`https://${req.headers.host}${req.url}`);
    }
    return next();
  });
}

// ================== Error Handling ==================
// Error handling for file uploads
app.use((err, req, res, next) => {
  if (err instanceof multer.MulterError) {
    return res.status(400).json(formatResponse(false, err.message));
  }
  next(err);
});

// Handle 404 errors
app.use((req, res) => {
  res.status(404).json(formatResponse(false, 'Endpoint not found'));
});

// Handle all other errors
app.use((err, req, res, next) => {
  logger.error(`Server Error: ${err.stack}`);
  res.status(err.statusCode || 500).json(
    formatResponse(false, process.env.NODE_ENV === 'development' ? err.message : 'Internal server error')
  );
});

// ================== Server Initialization ==================
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  logger.info(`Server running in ${process.env.NODE_ENV} mode on port ${PORT}`);
});

// ===== Graceful Shutdown on Termination =====
const gracefulShutdown = async () => {
  await mongoose.connection.close();
  logger.info('MongoDB disconnected on app termination');
  process.exit(0);
};

process.on('SIGINT', gracefulShutdown);
process.on('SIGTERM', gracefulShutdown);

export default app;