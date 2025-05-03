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

// Load environment variables
dotenv.config();

// Initialize Express app
const app = express();

// ================== Security Middleware ==================
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

// ================== Rate Limiting ==================
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,
  message: formatResponse(false, 'Too many requests from this IP')
});
app.use('/api/', limiter);

// ================== Body Parsing ==================
app.use(express.json({ limit: '10kb' }));
app.use(express.urlencoded({ extended: true, limit: '10kb' }));
app.use(cookieParser());

// ================== Database Connection ==================
require('./config/db')();

// ================== Request Logging ==================
app.use((req, res, next) => {
  logger.info(`${req.method} ${req.originalUrl}`);
  next();
});

// ================== Route Imports ==================
const adminRoutes = require('./routes/admin');
const authRoutes = require('./routes/auth');
const paymentRoutes = require('./routes/payments');
const walletRoutes = require('./routes/wallets');
const transferRoutes = require('./routes/walletTransfer');
const investmentRoutes = require('./routes/investments');
const subscriptionRoutes = require('./routes/subscription');

// ================== Route Definitions ==================
app.use('/api/admin', adminRoutes);
app.use('/api/auth', authRoutes);
app.use('/api/payments', paymentRoutes);
app.use('/api/wallets', walletRoutes);
app.use('/api/transfers', transferRoutes);
app.use('/api/investments', investmentRoutes);
app.use('/api/subscriptions', subscriptionRoutes);

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
app.listen(PORT, () => {
  logger.info(`Server running in ${process.env.NODE_ENV} mode on port ${PORT}`);
});

// ===== Graceful Shutdown on Termination =====
const gracefulShutdown = async () => {
  await mongoose.connection.close();
  logger.info('MongoDB disconnected on app termination');
  process.exit(0);
};

process.on('SIGINT', gracefulShutdown); // For manual termination (Ctrl+C)
process.on('SIGTERM', gracefulShutdown); // For hosting platforms like Heroku/Vercel

module.exports = app;

// Add to server.js
const { Server } = require('socket.io');
const io = new Server(server, {
  cors: {
    origin: process.env.CLIENT_URL,
    methods: ["GET", "POST"]
  }
});

io.on('connection', (socket) => {
  console.log('Client connected');
  
  // Join user-specific room
  socket.on('authenticate', (token) => {
    try {
      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      socket.join(`user_${decoded.id}`);
    } catch (error) {
      socket.disconnect();
    }
  });
});

app.use((req, res, next) => {
  auditService.log('api_request', {
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

// Error handling for file uploads
app.use((err, req, res, next) => {
  if (err instanceof multer.MulterError) {
    return res.status(400).json(formatResponse(false, err.message));
  }
  next(err);
});