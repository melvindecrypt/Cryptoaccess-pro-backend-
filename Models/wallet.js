const mongoose = require('mongoose');
const { formatResponse } = require('../utils/helpers');
const Transaction = require('./Transaction');
const User = require('./User');
const Decimal = require('decimal.js');

const MIN_BALANCE = 0;

const walletSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: [true, 'User ID is required'],
      index: true,
      unique: true // Assuming one wallet per user for all currencies
    },
    balances: {
      type: Map, // Use a Map to store currency balances dynamically
      of: Number, // The value of each entry will be a Number (the balance)
      default: {} // Initialize with an empty object
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
  async createWallet(userId) { // Removed currency parameter
    const session = await mongoose.startSession();
    session.startTransaction();

    try {
      // Check user existence and approval status
      const user = await User.findById(userId).session(session);
      if (!user) throw new Error('User not found');
      if (!user.isApproved) throw new Error('User account not approved');

      const wallet = new this({ userId }); // No currency initially
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
  async deposit(currency, amount, session = null) { // Added currency parameter
    if (!currency) throw new Error('Currency is required for deposit');
    if (amount <= 0) throw new Error('Invalid deposit amount');

    const currentBalance = new Decimal(this.balances.get(currency) || 0);
    const updatedBalance = currentBalance.plus(new Decimal(amount));
    this.balances.set(currency, Number(updatedBalance.toFixed(8)));

    const transaction = await Transaction.create({
      userId: this.userId,
      walletId: this._id,
      type: 'deposit',
      currency,
      amount
    });

    this.transactions.push(transaction._id);
    return this.save({ session });
  },

  validateAddress(address) {
    const currencyValidators = {
      BTC: /^[13][a-km-zA-HJ-NP-Z1-9]{25,34}$/,
      ETH: /^0x[a-fA-F0-9]{40}$/
      // Add other core currencies if you still use this here
    };
    return currencyValidators[this.currency]?.test(address) || false; // Make sure currency exists in validator
  },

  async withdraw(currency, amount, session = null) { // Added currency parameter
    if (!currency) throw new Error('Currency is required for withdrawal');
    if (amount <= 0) throw new Error('Invalid withdrawal amount');

    const currentBalance = new Decimal(this.balances.get(currency) || 0);
    const subtractAmount = new Decimal(amount);

    if (currentBalance.lessThan(subtractAmount)) throw new Error('Insufficient funds');

    const updatedBalance = currentBalance.minus(subtractAmount);
    this.balances.set(currency, Number(updatedBalance.toFixed(8)));

    const transaction = await Transaction.create({
      userId: this.userId,
      walletId: this._id,
      type: 'withdrawal',
      currency,
      amount
    });

    this.transactions.push(transaction._id);
    return this.save({ session });
  },

  async updateBalance(currency, amount, type, session = null) { // Generic function for balance updates
    if (!currency) throw new Error('Currency is required for balance update');
    const currentBalance = new Decimal(this.balances.get(currency) || 0);
    let newBalance;

    switch (type) {
      case 'increment':
        newBalance = currentBalance.plus(new Decimal(amount));
        break;
      case 'decrement':
        newBalance = currentBalance.minus(new Decimal(amount));
        if (newBalance.lessThan(0)) throw new Error('Insufficient funds');
        break;
      case 'set':
        newBalance = new Decimal(amount);
        break;
      default:
        throw new Error(`Invalid balance update type: ${type}`);
    }

    this.balances.set(currency, Number(newBalance.toFixed(8)));
    return this.save({ session });
  }
};

module.exports = mongoose.model('Wallet', walletSchema);

