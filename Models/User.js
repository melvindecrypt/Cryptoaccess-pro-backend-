const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const { v4: uuidv4 } = require('uuid');
const crypto = require('crypto');

// Constants
const PASSWORD_REGEX = /^(?=.*\d)(?=.*[a-z])(?=.*[A-Z])(?=.*[!@#$%^&*]).{12,}$/;
const WALLET_PREFIX = 'WALLET-';
const REFERRAL_CODE_LENGTH = 8;

const userSchema = new mongoose.Schema({
  // ----- Core User Info (Both Versions) -----
  email: { 
    type: String,
    required: [true, 'Email is required'],
    unique: true,
    lowercase: true,
    match: [/\w+([\.-]?\w+)*@\w+([\.-]?\w+)*(\.\w{2,3})+$/, 'Invalid email format'],
    index: true
  },
  password: {
    type: String,
    required: [true, 'Password is required'],
    minlength: [12, 'Password must be at least 12 characters'],
    validate: {
      validator: v => PASSWORD_REGEX.test(v),
      message: 'Must contain uppercase, lowercase, number, and special character'
    },
    select: false
  },

  // ----- Financial Features (Enhanced from New) -----
  walletId: {
    type: String,
    unique: true,
    index: true,
    default: () => generateUniqueWalletId()
  },
  virtualBalances: {
    BTC: { type: Number, default: 0, min: 0 },
    ETH: { type: Number, default: 0, min: 0 },
    USDT: { type: Number, default: 0, min: 0 }
  },
  transactions: [{
    type: {
      type: String,
      enum: ['deposit', 'withdrawal', 'transfer']
    },
    amount: Number,
    currency: String,
    timestamp: { type: Date, default: Date.now }
  }],

  // ----- Referral System (Both Versions) -----
  referralCode: {
    type: String,
    unique: true,
    default: () => generateReferralCode()
  },
  referredBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    default: null
  },
  referredUsers: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  }],

  // ----- Subscription System (New Version Additions) -----
  subscription: {
    isProPlus: { type: Boolean, default: false },
    subscribedAt: Date,
    expiresAt: Date,
    paymentStatus: {
      type: String,
      enum: ['pending', 'verified', 'rejected'],
      default: null
    },
    paymentEvidence: {
      transactionId: String,
      screenshot: String,
      timestamp: Date
    }
  },
  subscriptionHistory: [{
    startDate: Date,
    endDate: Date,
    verifiedBy: mongoose.Schema.Types.ObjectId,
    paymentEvidence: Object
  }],

  // ----- Account Status (Merged Flags) -----
  isAdmin: { type: Boolean, default: false, select: false, index: true },
  isVerified: { type: Boolean, default: false },
  isApproved: { type: Boolean, default: false },
  isSuspended: { type: Boolean, default: false },
  hasPaid: { type: Boolean, default: false }, // Old version flag

  // ----- KYC System (Both Versions) -----
  kycStatus: {
    type: String,
    enum: ['pending', 'approved', 'rejected'],
    default: 'pending'
  },
  kycDocuments: [{
    docType: String,
    fileUrl: String,
    status: {
      type: String,
      enum: ['pending', 'verified', 'rejected'],
      default: 'pending'
    }
  }],

 // ----- Security Features (Both Versions) -----
verificationToken: { 
  type: String, 
  select: false 
  comment: 'Hashed token for email verification'
},
verificationExpires: Date,
isVerified: { 
  type: Boolean, 
  default: false 
  comment: 'True after email verification'
},
failedLoginAttempts: { type: Number, default: 0 },
lockUntil: Date,
lastLogin: Date,
passwordHistory: [{
  password: String,
  changedAt: Date
}]

// ----- Admin Permissions -----
  permissions: {
    type: [String],
    enum: ['view', 'edit', 'delete'], // Adjust permissions as needed
    default: ['view']
  }

}, {
  timestamps: true,
  versionKey: false,
  toJSON: {
    virtuals: true,
    transform: function(doc, ret) {
      delete ret.password;
      delete ret.verificationToken;
      delete ret.failedLoginAttempts;
      return ret;
    }
  }
});

// ================== Utility Functions ==================
const generateUniqueWalletId = async () => {
  let isUnique = false;
  let walletId;
  while (!isUnique) {
    walletId = WALLET_PREFIX + uuidv4().replace(/-/g, '').substring(0, 16).toUpperCase();
    const existingUser = await mongoose.model('User').findOne({ walletId });
    if (!existingUser) isUnique = true;
  }
  return walletId;
};

const generateReferralCode = () => uuidv4().slice(0, REFERRAL_CODE_LENGTH).toUpperCase();

// ================== Hooks ==================
userSchema.pre('save', async function(next) {
  try {
    // Password Management (Both Versions)
    if (this.isModified('password')) {
      const salt = await bcrypt.genSalt(10);
      this.password = await bcrypt.hash(this.password, salt);
      this.passwordHistory = [
        { password: this.password, changedAt: new Date() },
        ...this.passwordHistory.slice(0, 2)
      ];
    }

    // Wallet ID Generation (Both Versions)
    if (!this.walletId) {
      this.walletId = await generateUniqueWalletId();
    }

    next();
  } catch (err) {
    next(new Error(`Error processing user data: ${err.message}`));
  }
});

// ================== Instance Methods ==================
userSchema.methods = {
  // Security Methods (Both Versions)
  comparePassword: async function(candidatePassword) {
    return bcrypt.compare(candidatePassword, this.password);
  },
  generateVerificationToken: function() {
    const token = crypto.randomBytes(20).toString('hex');
    this.verificationToken = crypto.createHash('sha256').update(token).digest('hex');
    this.verificationExpires = Date.now() + 24 * 60 * 60 * 1000;
    return token;
  },
  isVerificationTokenValid: function(token) {
    const hashedToken = crypto.createHash('sha256').update(token).digest('hex');
    return this.verificationToken === hashedToken && this.verificationExpires > Date.now();
  },
isDeleted: {
  type: Boolean,
  default: false,
  select: false
},
deletionMarkedAt: Date

  // Login Management (Both Versions)
  trackLoginSuccess: function() {
    this.lastLogin = new Date();
    return this.save();
  },
  handleFailedLogin: async function() {
    this.failedLoginAttempts += 1;
    if (this.failedLoginAttempts >= 5) {
      this.lockUntil = new Date(Date.now() + 15 * 60 * 1000);
    }
    return this.save();
  },
  resetLoginAttempts: function() {
    this.failedLoginAttempts = 0;
    this.lockUntil = undefined;
    return this.save();
  }
};

// ================== Static Methods ==================
userSchema.statics = {
  findByEmail: function(email) {
    return this.findOne({ email }).select('+password +failedLoginAttempts');
  },
  isWalletIdUnique: async function(walletId) {
    const count = await this.countDocuments({ walletId });
    return count === 0;
  }
};

module.exports = mongoose.model('User', userSchema);

// ================== Add to User schema: ==================
  withdrawalWhitelist: [{
    address: String,
    currency: String,
    label: String
  }]

// In models/User.js
const mongoose = require('mongoose');
// ... other imports and schema definition ...

const userSchema = new mongoose.Schema({
  // ... other fields ...
  language: {
    type: String,
    default: 'en' // Or your preferred default language
  },
 // ... other fields ...
  name: { type: String },
  surname: { type: String },
  phone: { type: String }, // You might want to add validation rules for phone numbers
  email: { /* ... your existing email definition ... */ },
  // ... other fields ...
}, {
  // ... schema options ...
});

// ... rest of your User model ...
