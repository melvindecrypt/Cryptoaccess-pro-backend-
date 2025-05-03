const mongoose = require('mongoose');
const { formatResponse } = require('../utils/helpers');
const Transaction = require('./Transaction');
const User = require('./User');
const Decimal = require('decimal.js');

const SUPPORTED_CURRENCIES = ['BTC', 'ETH', 'USDT', 'BNB'];
const MIN_BALANCE = 0;

const walletSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: [true, 'User ID is required'],
      index: true
    },
    currency: {
      type: String,
      enum: SUPPORTED_CURRENCIES,
      required: [true, 'Currency type is required'],
      uppercase: true
    },
    balance: {
      type: Number,
      default: 0,
      min: [MIN_BALANCE, `Balance cannot be less than ${MIN_BALANCE}`]
    },
    transactions: [{
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Transaction'
    }],
    isActive: {
      type: Boolean,
      default: true
    }
  },
  { 
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true }
  }
);

// Static Methods
walletSchema.statics = {
  async createWallet(userId, currency = 'BTC') {
    const session = await mongoose.startSession();
    session.startTransaction();
    
    try {
      // Check user existence and approval status
      const user = await User.findById(userId).session(session);
      if (!user) throw new Error('User not found');
      if (!user.isApproved) throw new Error('User account not approved');

      const wallet = new this({ userId, currency });
      await wallet.save({ session });
      
      // Update user's wallet references
      user.wallets.push(wallet._id);
      await user.save({ session });
      
      await session.commitTransaction();
      return wallet;
    } catch (error) {
      await session.abortTransaction();
      throw error;
    } finally {
      session.endSession();
    }
  }
};

// Instance Methods
walletSchema.methods = {
  async deposit(amount, session = null) {
  if (amount <= 0) throw new Error('Invalid deposit amount');

  const current = new Decimal(this.balance);
  const updated = current.plus(new Decimal(amount));

  this.balance = Number(updated.toFixed(8));
  const transaction = await Transaction.create({
    userId: this.userId,
    walletId: this._id,
    type: 'deposit',
    amount
  });

// Add to instance methods:
  validateAddress(address) {
    const currencyValidators = {
      BTC: /^[13][a-km-zA-HJ-NP-Z1-9]{25,34}$/,
      ETH: /^0x[a-fA-F0-9]{40}$/
      // Add other currencies
    };
    return currencyValidators[this.currency].test(address);
  }

  this.transactions.push(transaction._id);
  return this.save({ session });
},

  async withdraw(amount, session = null) {
  if (amount <= 0) throw new Error('Invalid withdrawal amount');

  const current = new Decimal(this.balance);
  const subtract = new Decimal(amount);

  if (current.lessThan(subtract)) throw new Error('Insufficient funds');

  const updated = current.minus(subtract);

  this.balance = Number(updated.toFixed(8));
  const transaction = await Transaction.create({
    userId: this.userId,
    walletId: this._id,
    type: 'withdrawal',
    amount
  });

  this.transactions.push(transaction._id);
  return this.save({ session });
}

module.exports = mongoose.model('Wallet', walletSchema);