import mongoose from 'mongoose';
import logger from '../utils/logger.js'; // Import the logger

const connectDB = async () => {
  try {
    await mongoose.connect(process.env.MONGODB_URI, {
      useNewUrlParser: true,
      useUnifiedTopology: true,
      ssl: true, // Use SSL if needed
      tlsAllowInvalidCertificates: false, // Adjust based on your security requirements
      maxPoolSize: 50,
      minPoolSize: 10,
      socketTimeoutMS: 30000,
      serverSelectionTimeoutMS: 5000,
    });
    logger.info('MongoDB securely connected'); // Using logger for success message
  } catch (error) {
    logger.error(`Database connection failed: ${error.message}`); // Using logger for error message
    process.exit(1); // Exit the process on failure to connect
  }
};

// Export the connectDB function to be used elsewhere
export default connectDB;

// Graceful shutdown handling
process.on('SIGINT', async () => {
  try {
    await mongoose.connection.close();
    logger.info('MongoDB disconnected on app termination');
    process.exit(0);
  } catch (error) {
    logger.error(`Error during MongoDB disconnection: ${error.message}`);
    process.exit(1); // Exit on disconnection failure
  }
});