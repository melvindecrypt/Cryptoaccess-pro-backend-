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

// Load environment variables
dotenv.config();

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
const adminRoutes = require('./routes/admin.js');
const authRoutes = require('./routes/auth.js');
const paymentRoutes = require('./routes/payments.js');
const walletRoutes = require('./routes/wallets.js'); // Corrected typo: wallets
const transferRoutes = require('./routes/walletTransfer.js');
const investmentRoutes = require('./routes/investments.js');
const subscriptionRoutes = require('./routes/subscription.js');
const adminSettingsRoutes = require('./routes/adminSettings.js'); // Assuming this path is correct
const chartRoutes = require('./routes/charts.js');
const exchangeRoutes = require('./routes/exchange.js');
const withdrawalRoutes = require('./routes/withdrawal.js'); // Import the new withdrawal routes

// ================== Route Definitions ==================
app.use('/api/admin', adminRoutes);
app.use('/api/auth', authRoutes);
app.use('/api/payments', paymentRoutes);
app.use('/api/wallets', walletRoutes);
app.use('/api/transfers', transferRoutes);
app.use('/api/investments', investmentRoutes);
app.use('/api/subscriptions', subscriptionRoutes);
app.use('/api/admin/settings', adminSettingsRoutes); // Mount admin settings routes
app.use('/api/charts', chartRoutes);
app.use('/api/exchange', exchangeRoutes);
app.use('/api/wallets/withdraw', withdrawalRoutes); // Mount the withdrawal routes under the correct path

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




import fs from 'fs';
import path from 'path';

// ... other imports ...

// Load environment variables
dotenv.config();

// Ensure upload directories exist
const uploadDirs = ['./uploads/kyc', './uploads/proPlusProofs'];
uploadDirs.forEach(dir => {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
    logger.info(`Created upload directory: ${dir}`);
  }
});

// Initialize Express app
const app = express();
// ... rest of your server.js
