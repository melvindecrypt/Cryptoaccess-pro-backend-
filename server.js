const express = require('express');
const mongoose = require('mongoose');
const dotenv = require('dotenv');
const cookieParser = require('cookie-parser');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const { body } = require('express-validator');
const logger = require('./utils/logger');
const { formatResponse } = require('./utils/helpers');
const { Server } = require('socket.io');
const jwt = require('jsonwebtoken'); // Assuming you use JWT for Socket.IO auth
const auditService = require('./services/auditService'); // Assuming you have an audit service
const multer = require('multer'); // Assuming you use multer for file uploads

// Load environment variables
dotenv.config();

// Initialize Express app
const app = express();
const server = require('http').createServer(app); // For Socket.IO

// ================== Socket.IO Setup ==================
const io = new Server(server, {
  cors: {
    origin: process.env.CLIENT_URL,
    methods: ["GET", "POST"]
  }
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
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'", "'unsafe-inline'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      imgSrc: ["'self'", 'data:', 'https://*.stripe.com'],
      connectSrc: ["'self'", 'https://api.stripe.com']
    }
  }
}));
app.use(cors({
  origin: process.env.CLIENT_URL,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  credentials: true
}));
app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  next();
});

// Rate Limiting
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,
  message: formatResponse(false, 'Too many requests from this IP')
});
app.use('/api/', limiter);

// Body Parsing
app.use(express.json({ limit: '10kb' }));
app.use(express.urlencoded({ extended: true, limit: '10kb' }));
app.use(cookieParser());

// Request Logging
app.use((req, res, next) => {
  logger.info(`${req.method} ${req.originalUrl}`);
  auditService.log('api_request', { // Assuming auditService is defined
    ip: req.ip,
    userAgent: req.get('User-Agent'),
    metadata: {
      method: req.method,
      path: req.path,
      params: req.params,
      query: req.query
    }
  });
  next();
});

// Serve static files
app.use('/kyc', express.static('uploads/kyc'));

// ================== Database Connection ==================
require('./config/db')();

// ================== Route Imports ==================
const adminRoutes = require('./routes/admin');
const authRoutes = require('./routes/auth');
const paymentRoutes = require('./routes/payments');
const walletRoutes = require('./routes/wallets'); // Corrected typo: wallets
const transferRoutes = require('./routes/walletTransfer');
const investmentRoutes = require('./routes/investments');
const subscriptionRoutes = require('./routes/subscription');
const adminSettingsRoutes = require('./routes/adminSettings'); // Assuming this path is correct

// ================== Route Definitions ==================
app.use('/api/admin', adminRoutes);
app.use('/api/auth', authRoutes);
app.use('/api/payments', paymentRoutes);
app.use('/api/wallets', walletRoutes);
app.use('/api/transfers', transferRoutes);
app.use('/api/investments', investmentRoutes);
app.use('/api/subscriptions', subscriptionRoutes);
app.use('/api/admin/settings', adminSettingsRoutes); // Mount admin settings routes

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

app.use((req, res) => {
  res.status(404).json(formatResponse(false, 'Endpoint not found'));
});

app.use((err, req, res, next) => {
  logger.error(`Server Error: ${err.stack}`);
  res.status(err.statusCode || 500).json(formatResponse(false,
    process.env.NODE_ENV === 'development' ? err.message : 'Internal server error'
  ));
});

// ================== Server Initialization ==================
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => { // Use the 'server' object for Socket.IO
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

module.exports = app;

// In server.js
const chartRoutes = require('./routes/charts');
app.use('/api/charts', chartRoutes);

// In server.js
const walletRoutes = require('./routes/wallets');
app.use('/api/wallets', walletRoutes);

// In server.js
const subscriptionRoutes = require('./routes/subscription');
app.use('/api/plans', subscriptionRoutes);

// In your app.js or server.js
const exchangeRoutes = require('./routes/exchange');
app.use('/api/exchange', exchangeRoutes);
