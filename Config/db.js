import mongoose from 'mongoose';
import logger from '../utils/logger.js'; // Custom logger

const connectDB = async () => {
  try {
    await mongoose.connect(process.env.MONGODB_URI, {
      useNewUrlParser: true,
      useUnifiedTopology: true,
      ssl: true,
      tlsAllowInvalidCertificates: false,
      maxPoolSize: 50,
      minPoolSize: 10,
      socketTimeoutMS: 30000,
      serverSelectionTimeoutMS: 5000,
    });

    logger.info('✅ MongoDB securely connected');

    // Connection open listener
    mongoose.connection.once('open', () => {
      logger.info('🔗 MongoDB connection is open and ready');
    });

    // Connection error listener
    mongoose.connection.on('error', (err) => {
      logger.error(`❌ MongoDB connection error: ${err}`);
    });

    // Disconnection listener
    mongoose.connection.on('disconnected', () => {
      logger.warn('⚠️ MongoDB connection disconnected');
    });

  } catch (error) {
    logger.error(`❌ Database connection failed: ${error.message}`);
    process.exit(1); // Exit process if unable to connect
  }
};

export default connectDB;

// Graceful shutdown
const shutdown = async () => {
  try {
    await mongoose.connection.close();
    logger.info('🛑 MongoDB disconnected gracefully');
    process.exit(0);
  } catch (error) {
    logger.error(`❗ Error during MongoDB disconnection: ${error.message}`);
    process.exit(1);
  }
};

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);