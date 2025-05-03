const { sendWelcomeEmail } = require('../utils/emailService');
const { v4: uuidv4 } = require('uuid');
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const User = require('../models/User');
const Wallet = require('../models/Wallet');

exports.register = async (req, res) => {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const { email, password, referralCode } = req.body;

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

    // Optional referral logic
    let referredBy = null;
    if (referralCode) {
      const referrer = await User.findOne({ referralCode }).session(session);
      if (referrer) {
        referredBy = referrer._id;

        // Optionally track referral event in a separate collection
        // await Referral.create([{ referrerId: referrer._id, referredEmail: email }], { session });

        // Optional: add bonus to referrer or stats
      }
    }

    // Generate referral code for new user
    const newReferralCode = uuidv4().slice(0, 8);

    // Create new user
    const user = new User({
      email,
      password: hashedPassword,
      walletId: `WALLET-${uuidv4().replace(/-/g, '').substring(0, 16)}`,
      referredBy,
      kycStatus: 'pending', // Auto trigger KYC status
      referralCode: newReferralCode // generate their own referral code
    });

    await user.save({ session });

    // Create wallet for the new user
    const wallet = new Wallet({ userId: user._id });
    await wallet.save({ session });

    // Send welcome email
    await sendWelcomeEmail(user.email, user.walletId);

    // Commit transaction
    await session.commitTransaction();

    // Respond with success
    res.status(201).json({
      success: true,
      message: 'Registration successful. Check your email for wallet details. KYC pending.',
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