const { sendWelcomeEmail } = require('../utils/emailService');
const { v4: uuidv4 } = require('uuid');
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const User = require('../models/user');
const Wallet = require('../models/wallet');

exports.register = async (req, res) => {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const { email, password, referralCode: refcode } = req.body;

    // Validation
    if (!email || !password) {
      return res.status(400).json({
        success: false,
        error: 'Validation Error',
        message: 'Email and password are required'
      });
    }

    // Validate email format
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return res.status(400).json({
        success: false,
        error: 'Validation Error',
        message: 'Invalid email format'
      });
    }

    // Validate password strength
    if (password.length < 12 || !/\d/.test(password) || !/[A-Z]/.test(password)) {
      return res.status(400).json({
        success: false,
        error: 'Validation Error',
        message: 'Password must be at least 12 characters with a number and uppercase letter'
      });
    }

    // Check if email already exists
    const existingUser = await User.findOne({ email }).session(session);
    if (existingUser) {
      await session.abortTransaction();
      return res.status(409).json({
        success: false,
        error: 'Conflict',
        message: 'Email already registered'
      });
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
      referralCode: newReferralCode // generate their own referral code
    });

    await user.save({ session });

    // Handle referral tracking if a referral code was provided during registration
    if (refCode) {
      const referrer = await User.findOne({ referralCode: refCode }).session(session);
      if (referrer) {
        user.referredBy = referrer._id; // Set the 'referredBy' field of the new user
        referrer.referredUsers.push(user._id); // Add the new user's _id to the referrer's 'referredUsers'
        await referrer.save({ session }); // Save the referrer
      } else {
        console.log(`Referrer with code ${refCode} not found.`);
        // You might want to handle this case (e.g., log it, inform the user - though not typically done during signup)
      }
    }

    await user.save({ session });
    await session.commitTransaction();
    res.status(201).json({ success: true, message: 'User registered successfully', userId: user._id });

  } catch (error) {
    await session.abortTransaction();
    console.error('Registration error:', error);
    res.status(500).json({ success: false, error: 'Server Error', message: error.message });
  } finally {
    session.endSession();
  }
};

    // Create wallet for the new user
    const wallet = new Wallet({ userId: user._id });
    await wallet.save({ session });

    // Send welcome email
    await sendWelcomeEmail(user.email, user.walletId);

    // Commit transaction
    await session.commitTransaction();

    // Generate JWT token
    const token = jwt.sign(
      {
        id: user._id,
        email: user.email,
        walletId: user.walletId
      },
      process.env.JWT_SECRET,
      { expiresIn: '24h', algorithm: 'HS256' }
    );

    // Respond with success
    res.status(201).json({
      success: true,
      message: 'Registration successful. Check your email to verify.',
      token: jwt.sign(
        { id: user._id, email: user.email },
        process.env.JWT_SECRET,
        { expiresIn: '1h' }
      ),
      user: {
        id: user._id,
        email: user.email,
        walletId: user.walletId,
        referralCode: newReferralCode,
        kycStatus: 'pending'
      },
      referralUsed: !!referredBy
    });

  } catch (error) {
    await session.abortTransaction();
    res.status(500).json({
      success: false,
      error: 'Registration Failed',
      message: error.message
    });
  } finally {
    session.endSession();
  }
};

// Add JWT secret check
if (!process.env.JWT_SECRET) {
  throw new Error('Missing JWT_SECRET in environment');
}

// In register():
const token = jwt.sign(
  { 
    id: user._id, 
    email: user.email,
    walletId: user.walletId // Include for frontend
  },
  process.env.JWT_SECRET,
  { 
    expiresIn: '24h', // Extended from 1h
    algorithm: 'HS256' // Explicitly set
  }
);

const jwt = require('jsonwebtoken');
const Admin = require('../models/user'); // Assuming Admins are Users with `isAdmin` flag set

exports.adminLogin = async (req, res) => {
  const { email, password } = req.body;

  try {
    // Validation for email and password
    if (!email || !password) {
      return res.status(400).json({
        success: false,
        message: 'Email and password are required',
      });
    }

    // Find the admin by email
    const admin = await Admin.findOne({ email, isAdmin: true });

    if (!admin) {
      return res.status(404).json({
        success: false,
        message: 'Admin not found',
      });
    }

    // Compare the password
    const isMatch = await bcrypt.compare(password, admin.password);
    if (!isMatch) {
      return res.status(401).json({
        success: false,
        message: 'Invalid credentials',
      });
    }

    // Generate JWT token for admin
    const token = jwt.sign(
      { id: admin._id, email: admin.email, isAdmin: admin.isAdmin },
      process.env.JWT_SECRET,
      { expiresIn: '24h' } // You can adjust the expiration time as needed
    );

    // Respond with success and the token
    res.status(200).json({
      success: true,
      message: 'Admin login successful',
      token, // Return the token to the admin
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({
      success: false,
      message: 'Server error',
    });
  }
};

exports.login = async (req, res) => {
  try {
    const { email, password } = req.body;

    // Validation
    if (!email || !password) {
      return res.status(400).json({
        success: false,
        error: 'Validation Error',
        message: 'Email and password are required',
      });
    }

    // Find user by email
    const user = await User.findOne({ email });
    if (!user) {
      return res.status(401).json({
        success: false,
        error: 'Authentication Failed',
        message: 'Invalid credentials',
      });
    }

    // Compare password
    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      return res.status(401).json({
        success: false,
        error: 'Authentication Failed',
        message: 'Invalid credentials',
      });
    }

    // Check if account is suspended (you might have a `isSuspended` field in your User model)
    if (user.isSuspended) {
      return res.status(403).json({
        success: false,
        error: 'Forbidden',
        message: 'Account suspended',
      });
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
      { expiresIn: '24h' } // Adjust expiration as needed
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
    console.error('Login error:', error);
    res.status(500).json({
      success: false,
      error: 'Server Error',
      message: error.message,
    });
  }
};

// In AuthController.js

exports.logout = async (req, res) => {
  try {
    // Log the logout action on the server (optional but good for audit trails)
    console.log(`User ${req.user?.id} logged out.`);

    // Respond with a success message
    res.status(200).json({
      success: true,
      message: 'Logged out successfully.'
    });

    // The frontend will handle deleting the token and redirecting.

  } catch (error) {
    console.error('Logout error:', error);
    res.status(500).json({
      success: false,
      error: 'Server Error',
      message: error.message
    });
  }
};
