import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import mongoose from 'mongoose';
import { v4 as uuidv4 } from 'uuid';
import User from '../models/user.js';
import Wallet from '../models/wallet.js';
import logger from '../utils/logger.js';
import { sendWelcomeEmail } from '../utils/emailService.js';

// Registration
export const register = async (req, res) => {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const { email, password, referralCode: refCode } = req.body;

    // Validation
    if (!email || !password) {
      await session.abortTransaction();
      return res.status(400).json({ success: false, error: 'Email and password are required' });
    }

    // Validate email format
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      await session.abortTransaction();
      return res.status(400).json({ success: false, error: 'Invalid email format' });
    }

    // Validate password strength
    if (password.length < 12 || !/\d/.test(password) || !/[A-Z]/.test(password)) {
      await session.abortTransaction();
      return res.status(400).json({
        success: false,
        error: 'Password must be at least 12 characters with a number and uppercase letter',
      });
    }

    // Check if email already exists
    const existingUser = await User.findOne({ email }).session(session);
    if (existingUser) {
      await session.abortTransaction();
      return res.status(409).json({ success: false, error: 'Email already registered' });
    }

    // Hash password
    const hashedPassword = await bcrypt.hash(password, 12);

    // Generate referral code for new user
    const newReferralCode = uuidv4().slice(0, 8);

    // Create new user
    const user = new User({
      email,
      password: hashedPassword,
      walletId: `WALLET-${uuidv4().replace(/-/g, '').substring(0, 16)}`,
      referredBy: null,
      kycStatus: 'pending', // Auto trigger KYC status
      referralCode: newReferralCode, // Generate their own referral code
    });

    // Handle referral tracking if a referral code was provided during registration
    if (refCode) {
      const referrer = await User.findOne({ referralCode: refCode }).session(session);
      if (referrer) {
        user.referredBy = referrer._id; // Set the 'referredBy' field of the new user
        referrer.referredUsers.push(user._id); // Add the new user's _id to the referrer's 'referredUsers'
        await referrer.save({ session }); // Save the referrer
      } else {
        logger.warn(`Referrer with code ${refCode} not found.`);
      }
    }

    // Create wallet for the new user
    const wallet = new Wallet({ userId: user._id });
    await wallet.save({ session });

    // Save user
    await user.save({ session });

    // Send welcome email
    await sendWelcomeEmail(user.email, user.walletId);

    // Commit transaction
    await session.commitTransaction();

    // Generate JWT token
    const token = jwt.sign(
      {
        id: user._id,
        email: user.email,
        walletId: user.walletId,
      },
      process.env.JWT_SECRET,
      { expiresIn: '24h', algorithm: 'HS256' }
    );

    // Respond with success
    res.status(201).json({
      success: true,
      message: 'Registration successful. Check your email to verify.',
      token,
      user: {
        id: user._id,
        email: user.email,
        walletId: user.walletId,
        referralCode: newReferralCode,
        kycStatus: 'pending',
        referralUsed: !!user.referredBy,
      },
    });
  } catch (error) {
    await session.abortTransaction();
    logger.error(`Registration failed: ${error.message}`);
    res.status(500).json({ success: false, error: 'Registration failed', message: error.message });
  } finally {
    session.endSession();
  }
};

// Login
export const login = async (req, res) => {
  try {
    const { email, password } = req.body;

    // Validation
    if (!email || !password) {
      return res.status(400).json({ success: false, error: 'Email and password are required' });
    }

    // Find user by email
    const user = await User.findOne({ email });
    if (!user) {
      return res.status(401).json({ success: false, error: 'Invalid credentials' });
    }

    // Compare password
    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      return res.status(401).json({ success: false, error: 'Invalid credentials' });
    }

    // Check if account is suspended
    if (user.isSuspended) {
      return res.status(403).json({ success: false, error: 'Account suspended' });
    }

    // Generate JWT token
    const token = jwt.sign(
      {
        id: user._id,
        email: user.email,
        walletId: user.walletId,
        kycStatus: user.kycStatus,
      },
      process.env.JWT_SECRET,
      { expiresIn: '24h', algorithm: 'HS256' }
    );

    // Respond with success and token
    res.status(200).json({
      success: true,
      message: 'Login successful',
      token,
      user: {
        id: user._id,
        email: user.email,
        walletId: user.walletId,
        kycStatus: user.kycStatus,
      },
    });
  } catch (error) {
    logger.error(`Login failed: ${error.message}`);
    res.status(500).json({ success: false, error: 'Login failed', message: error.message });
  }
};

// Logout
export const logout = async (req, res) => {
  try {
    // Log the logout action on the server (optional but good for audit trails)
    logger.info(`User ${req.user?.id} logged out.`);

    // Respond with a success message
    res.status(200).json({ success: true, message: 'Logged out successfully.' });
  } catch (error) {
    logger.error(`Logout failed: ${error.message}`);
    res.status(500).json({ success: false, error: 'Server Error', message: error.message });
  }
};