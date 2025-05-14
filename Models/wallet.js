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
    USD: { type: Number, default: 0 },
    BTC: { type: Number, default: 0 },
    ETH: { type: Number, default: 0 },
    USDT: { type: Number, default: 0 },
    BNB: { type: Number, default: 0 },
    SOL: { type: Number, default: 0 },
    USDC: { type: Number, default: 0 },
    XRP: { type: Number, default: 0 },
    TON: { type: Number, default: 0 },
    ADA: { type: Number, default: 0 },
    DOGE: { type: Number, default: 0 },
    AVAX: { type: Number, default: 0 },
    SHIB: { type: Number, default: 0 },
    DOT: { type: Number, default: 0 },
    TRX: { type: Number, default: 0 },
    LINK: { type: Number, default: 0 },
    MATIC: { type: Number, default: 0 },
    LTC: { type: Number, default: 0 },
    BCH: { type: Number, default: 0 },
    NEAR: { type: Number, default: 0 },
    UNI: { type: Number, default: 0 },
    ICP: { type: Number, default: 0 },
    APT: { type: Number, default: 0 },
    XLM: { type: Number, default: 0 },
    LDO: { type: Number, default: 0 },
    ARB: { type: Number, default: 0 },
    OP: { type: Number, default: 0 },
    XMR: { type: Number, default: 0 },
    RNDR: { type: Number, default: 0 },
    HBAR: { type: Number, default: 0 },
    VET: { type: Number, default: 0 },
    IMX: { type: Number, default: 0 },
    MKR: { type: Number, default: 0 },
    INJ: { type: Number, default: 0 },
    GRT: { type: Number, default: 0 },
    AAVE: { type: Number, default: 0 },
    SUI: { type: Number, default: 0 },
    ALGO: { type: Number, default: 0 },
    KAS: { type: Number, default: 0 },
    STX: { type: Number, default: 0 },
    QNT: { type: Number, default: 0 },
    FTM: { type: Number, default: 0 },
    THETA: { type: Number, default: 0 },
    FLOW: { type: Number, default: 0 },
    XTZ: { type: Number, default: 0 },
    BSV: { type: Number, default: 0 },
    TIA: { type: Number, default: 0 },
    CRV: { type: Number, default: 0 },
    AXS: { type: Number, default: 0 },
    APE: { type: Number, default: 0 },
    EOS: { type: Number, default: 0 },
    MANA: { type: Number, default: 0 },
    RPL: { type: Number, default: 0 },
    CAKE: { type: Number, default: 0 },
    GALA: { type: Number, default: 0 },
    DYDX: { type: Number, default: 0 },
    MINA: { type: Number, default: 0 },
    HNT: { type: Number, default: 0 },
    KAVA: { type: Number, default: 0 },
    WLD: { type: Number, default: 0 },
    IOTA: { type: Number, default: 0 },
    ROSE: { type: Number, default: 0 },
    ZEC: { type: Number, default: 0 },
    OCEAN: { type: Number, default: 0 },
    BLUR: { type: Number, default: 0 },
    NEO: { type: Number, default: 0 },
    ENJ: { type: Number, default: 0 },
    XRD: { type: Number, default: 0 },
    CKB: { type: Number, default: 0 },
    GMX: { type: Number, default: 0 },
    '1INCH': { type: Number, default: 0 }, // Ensure valid JS variable name
    BAND: { type: Number, default: 0 },
    WOO: { type: Number, default: 0 },
    ARKM: { type: Number, default: 0 },
    ONT: { type: Number, default: 0 },
    CVP: { type: Number, default: 0 },
    METIS: { type: Number, default: 0 },
    SPELL: { type: Number, default: 0 },
    RSR: { type: Number, default: 0 },
    TWT: { type: Number, default: 0 },
    XDC: { type: Number, default: 0 },
    ERG: { type: Number, default: 0 },
    TRAC: { type: Number, default: 0 },
    SUPER: { type: Number, default: 0 },
    GLMR: { type: Number, default: 0 },
    CELO: { type: Number, default: 0 },
    FIDA: { type: Number, default: 0 },
    COTI: { type: Number, default: 0 },
    XVS: { type: Number, default: 0 },
    EFI: { type: Number, default: 0 },
    BTT: { type: Number, default: 0 },
    ALPHA: { type: Number, default: 0 },
    BADGER: { type: Number, default: 0 },
    STRAX: { type: Number, default: 0 },
    XPRT: { type: Number, default: 0 },
    ALCX: { type: Number, default: 0 },
    SNX: { type: Number, default: 0 },
    NYM: { type: Number, default: 0 },
    VIC: { type: Number, default: 0 },
    ASTR: { type: Number, default: 0 },
    PUNDIX: { type: Number, default: 0 },
  },
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

