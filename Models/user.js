import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';
import { v4 as uuidv4 } from 'uuid';
import crypto from 'crypto';

// Constants
const PASSWORD_REGEX = /^(?=.*\d)(?=.*[a-z])(?=.*[A-Z])(?=.*[!@#$%^&*]).{12,}$/;
const WALLET_PREFIX = 'WALLET-';
const REFERRAL_CODE_LENGTH = 10;

// User Schema
const userSchema = new mongoose.Schema(
  {
    // ----- Core User Info (Both Versions) -----
    email: {
      type: String,
      required: [true, 'Email is required'],
      unique: true,
      lowercase: true,
      match: [/\w+([\.-]?\w+)*@\w+([\.-]?\w+)*(\.\w{2,3})+$/, 'Invalid email format'],
      index: true,
    },
    password: {
      type: String,
      required: [true, 'Password is required'],
      minlength: [12, 'Password must be at least 12 characters'],
      validate: {
        validator: (v) => PASSWORD_REGEX.test(v),
        message: 'Must contain uppercase, lowercase, number, and special character',
      },
      select: false,
    },

    // ----- Financial Features (Enhanced from New) -----
    walletId: {
      type: String,
      unique: true,
      index: true,
      default: () => generateUniqueWalletId(),
    },
    virtualBalances: {
      BTC: { type: Number, default: 0, min: 0 },
      ETH: { type: Number, default: 0, min: 0 },
      USDT: { type: Number, default: 0, min: 0 },
    },
    transactions: [
      {
        type: {
          type: String,
          enum: ['deposit', 'withdrawal', 'transfer'],
        },
        amount: Number,
        currency: String,
        timestamp: { type: Date, default: Date.now },
      },
    ],

    // ----- Referral System (Both Versions) -----
    referralCode: {
      type: String,
      unique: true,
      default: generateReferralCode,
    },
    referredBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
    },
    referredUsers: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
      },
    ],
    createdAt: { type: Date, default: Date.now }, // Add signup date
    accessPaymentCompleted: { type: Boolean, default: false }, // Add access payment status
    proPlusStatus: { type: Boolean, default: false }, // Add Pro+ status

    // ----- Subscription System (New Version Additions) -----
    subscription: {
      isProPlus: { type: Boolean, default: false },
      subscribedAt: Date,
      expiresAt: Date,
      paymentStatus: {
        type: String,
        enum: ['pending', 'verified', 'rejected'],
        default: null,
      },
      paymentEvidence: {
        transactionId: String,
        screenshot: String,
        timestamp: Date,
      },
    },
    subscriptionHistory: [
      {
        startDate: Date,
        endDate: Date,
        verifiedBy: mongoose.Schema.Types.ObjectId,
        paymentEvidence: Object,
      },
    ],

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
      default: 'pending',
    },
    kycDocuments: [
      {
        docType: {
          type: String,
          enum: [
            'PASSPORT',
            'DRIVERS_LICENSE',
            'NATIONAL_ID',
            'BIRTH_CERTIFICATE',
            'UTILITY_BILL',
            'VEHICLE_REGISTRATION',
            'GOVERNMENT_ID',
            'SELFIE',
          ],
          required: true,
        },
        frontFileUrl: String,
        backFileUrl: String,
        selfieFileUrl: String, // Add selfie file URL here as well
        frontStatus: {
          type: String,
          enum: ['pending', 'verified', 'rejected'],
          default: 'pending',
        },
        backStatus: {
          type: String,
          enum: ['pending', 'verified', 'rejected'],
          default: 'pending',
        },
        status: {
          // General status for documents without front/back
          type: String,
          enum: ['pending', 'verified', 'rejected'],
          default: 'pending',
        },
        uploadedAt: { type: Date, default: Date.now },
      },
    ],

    // ----- Security Features (Both Versions) -----
    verificationToken: {
      type: String,
      select: false,
      comment: 'Hashed token for email verification',
    },
    verificationExpires: Date,
    failedLoginAttempts: { type: Number, default: 0 },
    lockUntil: Date,
    lastLogin: Date,
    passwordHistory: [
      {
        password: String,
        changedAt: Date,
      },
    ],

    // ----- Admin Permissions -----
    permissions: {
      type: [String],
      enum: ['view', 'edit', 'delete'], // Adjust permissions as needed
      default: ['view'],
    },

  import mongoose from 'mongoose';

const userSchema = new mongoose.Schema(
  {
    // Essential User Fields (Assuming these exist in your full schema)
    // For example:
    // email: {
    //   type: String,
    //   required: true,
    //   unique: true,
    //   lowercase: true,
    //   trim: true,
    // },
    // password: {
    //   type: String,
    //   required: true,
    //   select: false, // Don't return password by default
    // },
    // verificationToken: String,
    // isVerified: {
    //   type: Boolean,
    //   default: false,
    // },
    // failedLoginAttempts: {
    //   type: Number,
    //   default: 0,
    //   select: false,
    // },
    // lockUntil: {
    //   type: Number, // Stores a Unix timestamp
    //   select: false,
    // },


    // ----- Additional Fields for User Profile & Settings -----
    language: {
      type: String,
      default: 'en', // Or your preferred default language like 'en'
    },
    name: {
      type: String,
      trim: true // It's good practice to trim whitespace from string inputs
    },
    surname: {
      type: String,
      trim: true
    },
    phone: {
      type: String,
      trim: true
      // You might want to add validation rules for phone numbers here,
      // e.g., match: /^\+\d{1,3}\d{10}$/ for international numbers, or custom validation
    },
    withdrawalWhitelist: [
      {
        address: {
          type: String,
          required: true,
          trim: true
        },
        currency: {
          type: String,
          required: true,
          uppercase: true, // Store currency symbols in uppercase
          trim: true
        },
        label: {
          type: String,
          trim: true
        },
        _id: false // Prevents Mongoose from creating an _id for subdocuments in this array
      },
    ],
    isDeleted: {
      type: Boolean,
      default: false,
      select: false, // Don't return this field by default in queries
    },
    deletionMarkedAt: Date, // Date when the user was marked for deletion
  },
  {
    timestamps: true, // Adds createdAt and updatedAt fields
    versionKey: false, // Disables the __v field
    toJSON: {
      virtuals: true, // Include virtuals when converting to JSON
      transform: function (doc, ret) {
        // Remove sensitive fields from the JSON output
        delete ret.password;
        delete ret.verificationToken;
        delete ret.failedLoginAttempts;
        delete ret.lockUntil; // Assuming this is part of your full User schema
        return ret;
      },
    },
    toObject: {
      virtuals: true, // Also include virtuals when converting to a plain JavaScript object
      transform: function (doc, ret) {
        delete ret.password;
        delete ret.verificationToken;
        delete ret.failedLoginAttempts;
        delete ret.lockUntil; // Assuming this is part of your full User schema
        return ret;
      },
    },
  }
);

// You might also have pre-save hooks for password hashing, etc.
// For example:
// userSchema.pre('save', async function(next) {
//   if (this.isModified('password')) {
//     this.password = await bcrypt.hash(this.password, 10);
//   }
//   next();
// });


export default mongoose.model('User', userSchema);



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
userSchema.pre('save', async function (next) {
  try {
    // Password Management (Both Versions)
    if (this.isModified('password')) {
      const salt = await bcrypt.genSalt(10);
      this.password = await bcrypt.hash(this.password, salt);
      this.passwordHistory = [
        { password: this.password, changedAt: new Date() },
        ...this.passwordHistory.slice(0, 2),
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
  comparePassword: async function (candidatePassword) {
    return bcrypt.compare(candidatePassword, this.password);
  },
  generateVerificationToken: function () {
    const token = crypto.randomBytes(20).toString('hex');
    this.verificationToken = crypto.createHash('sha256').update(token).digest('hex');
    this.verificationExpires = Date.now() + 24 * 60 * 60 * 1000;
    return token;
  },
  isVerificationTokenValid: function (token) {
    const hashedToken = crypto.createHash('sha256').update(token).digest('hex');
    return this.verificationToken === hashedToken && this.verificationExpires > Date.now();
  },

  // Login Management (Both Versions)
  trackLoginSuccess: function () {
    this.lastLogin = new Date();
    return this.save();
  },
  handleFailedLogin: async function () {
    this.failedLoginAttempts += 1;
    if (this.failedLoginAttempts >= 5) {
      this.lockUntil = new Date(Date.now() + 15 * 60 * 1000);
    }
    return this.save();
  },
  resetLoginAttempts: function () {
    this.failedLoginAttempts = 0;
    this.lockUntil = undefined;
    return this.save();
  },
};

// ================== Static Methods ==================
userSchema.statics = {
  findByEmail: function (email) {
    return this.findOne({ email }).select('+password +failedLoginAttempts');
  },
  isWalletIdUnique: async function (walletId) {
    const count = await this.countDocuments({ walletId });
    return count === 0;
  },
};

export default mongoose.model('User', userSchema);