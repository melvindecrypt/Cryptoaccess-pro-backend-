// controllers/exchangeController.js
const { formatResponse } = require('../utils/helpers');
const logger = require('../utils/logger');
const Wallet = require('../models/Wallet');
const Decimal = require('decimal.js');
const Currency = require('../models/Currency');
const Transaction = require('../models/Transaction'); // Make sure this path is correct
const Decimal = require('decimal.js');

// Paste the validateCurrency function here:
const validateCurrency = async (currency) => {
  const currencyData = await Currency.findOne({ symbol: currency.toUpperCase(), isActive: true });
  if (!currencyData) {
    throw new Error(`Unsupported currency: ${currency}`);
  }
  return currencyData;
};

let AVAILABLE_TRADING_PAIRS = [];

async function initializeTradingPairs() {
  try {
    const activeCurrencies = await Currency.find({ isActive: true }).select('symbol').lean();
    const baseCurrency = 'USD';

    const basePairs = activeCurrencies
      .filter(currency => currency.symbol !== baseCurrency)
      .map(currency => ({
        symbol: `${currency.symbol}/${baseCurrency}`,
        base: currency.symbol,
        quote: baseCurrency
      }));

    AVAILABLE_TRADING_PAIRS = [
      ...basePairs,
      // Your specific cross-pairs
      { symbol: 'AVAX/BTC', base: 'AVAX', quote: 'BTC' },
      // ... other cross-pairs
    ];

    console.log('Available Trading Pairs initialized:', AVAILABLE_TRADING_PAIRS);
  } catch (error) {
    console.error('Error initializing trading pairs:', error);
  }
}

initializeTradingPairs();

exports.getAvailableTradingPairs = async (req, res) => {
  res.json(formatResponse(true, 'Available trading pairs retrieved', AVAILABLE_TRADING_PAIRS));
};

exports.swapCurrency = async (req, res) => {
  // ... your swapCurrency function ...
};

async function getSimulatedExchangeRate(base, quote) {
  // ... your getSimulatedExchangeRate function ...
}

// ExchangeController.js

// ... imports, validateCurrency, AVAILABLE_TRADING_PAIRS, initializeTradingPairs, getAvailableTradingPairs, swapCurrency, getSimulatedExchangeRate ...

exports.buyCurrency = async (req, res) => {
  const session = await Wallet.startSession();
  session.startTransaction();

  try {
    const { baseCurrency, quoteCurrency, amount } = req.body; // Amount to spend in quoteCurrency
    const userId = req.user._id;
    const numericAmount = new Decimal(amount);

    await validateCurrency(baseCurrency);
    await validateCurrency(quoteCurrency);

    if (numericAmount.lessThanOrEqualTo(0)) {
      return res.status(400).json(formatResponse(false, 'Amount must be positive'));
    }

    const wallet = await Wallet.findOne({ userId }).session(session);
    if (!wallet) {
      return res.status(404).json(formatResponse(false, 'Wallet not found'));
    }

    const quoteBalance = new Decimal(wallet.balances.get(quoteCurrency) || 0);
    const currentPrice = await getSimulatedExchangeRate(baseCurrency, quoteCurrency); // Price of base in quote

    const baseAmountToBuy = numericAmount.dividedBy(currentPrice);

    if (quoteBalance.lessThan(numericAmount)) {
      return res.status(400).json(formatResponse(false, `Insufficient ${quoteCurrency} balance`));
    }

    // Update balances
    await wallet.updateBalance(quoteCurrency, numericAmount.negated(), 'decrement', session);
    await wallet.updateBalance(baseCurrency, baseAmountToBuy.toNumber(), 'increment', session);

    // Record transaction
    await Transaction.create({
      userId,
      walletId: wallet._id,
      type: 'buy',
      baseCurrency,
      quoteCurrency,
      amount: baseAmountToBuy.toNumber(), // Amount of base currency bought
      price: currentPrice.toNumber(),
      totalCost: numericAmount.toNumber(),
      status: 'COMPLETED',
      timestamp: new Date()
    }, { session });

    await session.commitTransaction();
    res.json(formatResponse(true, `Successfully bought ${baseAmountToBuy.toFixed(8)} ${baseCurrency}`, { receivedAmount: baseAmountToBuy.toNumber() }));

  } catch (error) {
    await session.abortTransaction();
    logger.error(`Buy error: ${error.message}`);
    res.status(400).json(formatResponse(false, error.message));
  } finally {
    session.endSession();
  }
};

exports.sellCurrency = async (req, res) => {
  const session = await Wallet.startSession();
  session.startTransaction();

  try {
    const { baseCurrency, quoteCurrency, amount } = req.body; // Amount of baseCurrency to sell
    const userId = req.user._id;
    const numericAmount = new Decimal(amount);

    await validateCurrency(baseCurrency);
    await validateCurrency(quoteCurrency);

    if (numericAmount.lessThanOrEqualTo(0)) {
      return res.status(400).json(formatResponse(false, 'Amount must be positive'));
    }

    const wallet = await Wallet.findOne({ userId }).session(session);
    if (!wallet) {
      return res.status(404).json(formatResponse(false, 'Wallet not found'));
    }

    const baseBalance = new Decimal(wallet.balances.get(baseCurrency) || 0);
    const currentPrice = await getSimulatedExchangeRate(baseCurrency, quoteCurrency); // Price of base in quote
    const quoteAmountToReceive = numericAmount.multipliedBy(currentPrice);

    if (baseBalance.lessThan(numericAmount)) {
      return res.status(400).json(formatResponse(false, `Insufficient ${baseCurrency} balance`));
    }

    // Update balances
    await wallet.updateBalance(baseCurrency, numericAmount.negated(), 'decrement', session);
    await wallet.updateBalance(quoteCurrency, quoteAmountToReceive.toNumber(), 'increment', session);

    // Record transaction
    await Transaction.create({
      userId,
      walletId: wallet._id,
      type: 'sell',
      baseCurrency,
      quoteCurrency,
      amount: numericAmount.toNumber(), // Amount of base currency sold
      price: currentPrice.toNumber(),
      receivedAmount: quoteAmountToReceive.toNumber(),
      status: 'COMPLETED',
      timestamp: new Date()
    }, { session });

    await session.commitTransaction();
    res.json(formatResponse(true, `Successfully sold ${numericAmount.toFixed(8)} ${baseCurrency}`, { receivedAmount: quoteAmountToReceive.toNumber() }));

  } catch (error) {
    await session.abortTransaction();
    logger.error(`Sell error: ${error.message}`);
    res.status(400).json(formatResponse(false, error.message));
  } finally {
    session.endSession();
  }
};

// ... any other functions in your ExchangeController

let AVAILABLE_TRADING_PAIRS = [];

async function initializeTradingPairs() {
  try {
    const activeCurrencies = await Currency.find({ isActive: true }).select('symbol').lean();
    const baseCurrency = 'USD';

    const basePairs = activeCurrencies
      .filter(currency => currency.symbol !== baseCurrency)
      .map(currency => ({
        symbol: `${currency.symbol}/${baseCurrency}`,
        base: currency.symbol,
        quote: baseCurrency
      }));

    AVAILABLE_TRADING_PAIRS = [
      ...basePairs,
  { symbol: "AVAX/BTC", base: "AVAX", quote: "BTC" },
  { symbol: "SHIB/ETH", base: "SHIB", quote: "ETH" },
  { symbol: "DOT/USDT", base: "DOT", quote: "USDT" },
  { symbol: "LINK/XRP", base: "LINK", quote: "XRP" },
  { symbol: "MATIC/BNB", base: "MATIC", quote: "BNB" },
  { symbol: "LTC/SOL", base: "LTC", quote: "SOL" },
  { symbol: "BCH/USDC", base: "BCH", quote: "USDC" },
  { symbol: "NEAR/DOGE", پایه: "NEAR", quote: "DOGE" },
  { symbol: "UNI/ADA", base: "UNI", quote: "ADA" },
  { symbol: "ICP/TRX", base: "ICP", quote: "TRX" },
  { symbol: "APT/BTC", base: "APT", quote: "BTC" },
  { symbol: "XLM/ETH", base: "XLM", quote: "ETH" },
  { symbol: "LDO/USDT", base: "LDO", quote: "USDT" },
  { symbol: "ARB/XRP", base: "ARB", quote: "XRP" },
  { symbol: "OP/BNB", base: "OP", quote: "BNB" },
  { symbol: "XMR/SOL", base: "XMR", quote: "SOL" },
  { symbol: "RNDR/USDC", base: "RNDR", quote: "USDC" },
  { symbol: "HBAR/DOGE", base: "HBAR", quote: "DOGE" },
  { symbol: "VET/ADA", base: "VET", quote: "ADA" },
  { symbol: "IMX/TRX", base: "IMX", quote: "TRX" },
  { symbol: "MKR/BTC", base: "MKR", quote: "BTC" },
  { symbol: "INJ/ETH", base: "INJ", quote: "ETH" },
  { symbol: "GRT/USDT", base: "GRT", quote: "USDT" },
  { symbol: "AAVE/XRP", base: "AAVE", quote: "XRP" },
  { symbol: "SUI/BNB", base: "SUI", quote: "BNB" },
  { symbol: "ALGO/SOL", base: "ALGO", quote: "SOL" },
  { symbol: "KAS/USDC", base: "KAS", quote: "USDC" },
  { symbol: "STX/DOGE", base: "STX", quote: "DOGE" },
  { symbol: "QNT/ADA", base: "QNT", quote: "ADA" },
  { symbol: "FTM/TRX", base: "FTM", quote: "TRX" },
  { symbol: "THETA/BTC", base: "THETA", quote: "BTC" },
  { symbol: "FLOW/ETH", base: "FLOW", quote: "ETH" },
  { symbol: "XTZ/USDT", base: "XTZ", quote: "USDT" },
  { symbol: "BSV/XRP", base: "BSV", quote: "XRP" },
  { symbol: "TIA/BNB", base: "TIA", quote: "BNB" },
  { symbol: "CRV/SOL", base: "CRV", quote: "SOL" },
  { symbol: "AXS/USDC", base: "AXS", quote: "USDC" },
  { symbol: "APE/DOGE", base: "APE", quote: "DOGE" },
  { symbol: "EOS/ADA", base: "EOS", quote: "ADA" },
  { symbol: "MANA/TRX", base: "MANA", quote: "TRX" },
  { symbol: "RPL/BTC", base: "RPL", quote: "BTC" },
  { symbol: "CAKE/ETH", base: "CAKE", quote: "ETH" },
  { symbol: "GALA/USDT", base: "GALA", quote: "USDT" },
  { symbol: "DYDX/XRP", base: "DYDX", quote: "XRP" },
  { symbol: "MINA/BNB", base: "MINA", quote: "BNB" },
  { symbol: "HNT/SOL", base: "HNT", quote: "SOL" },
  { symbol: "KAVA/USDC", base: "KAVA", quote: "USDC" },
  { symbol: "WLD/DOGE", base: "WLD", quote: "DOGE" },
  { symbol: "IOTA/ADA", base: "IOTA", quote: "ADA" },
  { symbol: "ROSE/TRX", base: "ROSE", quote: "TRX" },
  { symbol: "ZEC/BTC", base: "ZEC", quote: "BTC" },
  { symbol: "OCEAN/ETH", base: "OCEAN", quote: "ETH" },
  { symbol: "BLUR/USDT", base: "BLUR", quote: "USDT" },
  { symbol: "NEO/XRP", base: "NEO", quote: "XRP" },
  { symbol: "ENJ/BNB", base: "ENJ", quote: "BNB" },
  { symbol: "XRD/SOL", base: "XRD", quote: "SOL" },
  { symbol: "CKB/USDC", base: "CKB", quote: "USDC" },
  { symbol: "GMX/DOGE", base: "GMX", quote: "DOGE" },
  { symbol: "1INCH/ADA", base: "1INCH", quote: "ADA" },
  { symbol: "BAND/TRX", base: "BAND", quote: "TRX" },
  { symbol: "WOO/BTC", base: "WOO", quote: "BTC" },
  { symbol: "ARKM/ETH", base: "ARKM", quote: "ETH" },
  { symbol: "ONT/USDT", base: "ONT", quote: "USDT" },
  { symbol: "CVP/XRP", base: "CVP", quote: "XRP" },
  { symbol: "METIS/BNB", base: "METIS", quote: "BNB" },
  { symbol: "SPELL/SOL", base: "SPELL", quote: "SOL" },
  { symbol: "RSR/USDC", base: "RSR", quote: "USDC" },
  { symbol: "TWT/DOGE", base: "TWT", quote: "DOGE" },
  { symbol: "XDC/ADA", base: "XDC", quote: "ADA" },
  { symbol: "ERG/TRX", base: "ERG", quote: "TRX" },
  { symbol: "TRAC/BTC", base: "TRAC", quote: "BTC" },
  { symbol: "SUPER/ETH", base: "SUPER", quote: "ETH" },
  { symbol: "GLMR/USDT", base: "GLMR", quote: "USDT" },
  { symbol: "CELO/XRP", base: "CELO", quote: "XRP" },
  { symbol: "FIDA/BNB", base: "FIDA", quote: "BNB" },
  { symbol: "COTI/SOL", base: "COTI", quote: "SOL" },
  { symbol: "XVS/USDC", base: "XVS", quote: "USDC" },
  { symbol: "EFI/DOGE", base: "EFI", quote: "DOGE" },
  { symbol: "BTT/ADA", base: "BTT", quote: "ADA" },
  { symbol: "ALPHA/TRX", base: "ALPHA", quote: "TRX" },
  { symbol: "BADGER/BTC", base: "BADGER", quote: "BTC" },
  { symbol: "STRAX/ETH", base: "STRAX", quote: "ETH" },
  { symbol: "XPRT/USDT", base: "XPRT", quote: "USDT" },
  { symbol: "ALCX/XRP", base: "ALCX", quote: "XRP" },
  { symbol: "SNX/BNB", base: "SNX", quote: "BNB" },
  { symbol: "NYM/SOL", base: "NYM", quote: "SOL" },
  { symbol: "VIC/USDC", base: "VIC", quote: "USDC" },
  { symbol: "ASTR/DOGE", base: "ASTR", quote: "DOGE" },
  { symbol: "PUNDIX/ADA", base: "PUNDIX", quote: "ADA" },
  { symbol: "TON/BTC", base: "TON", quote: "BTC" },
  { symbol: "LDO/ETH", base: "LDO", quote: "ETH" },
  { symbol: "HBAR/USDT", base: "HBAR", quote: "USDT" },
  { symbol: "VET/XRP", base: "VET", quote: "XRP" },
  { symbol: "INJ/BNB", base: "INJ", quote: "BNB" },
  { symbol: "GRT/SOL", base: "GRT", quote: "SOL" },
  { symbol: "SUI/USDC", base: "SUI", quote: "USDC" },
  { symbol: "KAS/DOGE", base: "KAS", quote: "DOGE" },
  { symbol: "QNT/ADA", base: "QNT", quote: "ADA" },
  { symbol: "FTM/TRX", base: "FTM", quote: "TRX" },
  { symbol: "THETA/BTC", base: "THETA", quote: "BTC" },
  { symbol: "PUNDIX/BTC", base: "PUNDIX", quote: "BTC" },
  { symbol: "ASTR/ETH", base: "ASTR", quote: "ETH" },
  { symbol: "VIC/USDT", base: "VIC", quote: "USDT" },
  { symbol: "NYM/XRP", base: "NYM", quote: "XRP" },
  { symbol: "SNX/SOL", base: "SNX", quote: "SOL" },
  { symbol: "ALCX/BNB", base: "ALCX", quote: "BNB" },
  { symbol: "XPRT/USDC", base: "XPRT", quote: "USDC" },
  { symbol: "STRAX/DOGE", base: "STRAX", quote: "DOGE" },
  { symbol: "BADGER/ADA", base: "BADGER", quote: "ADA" },
  { symbol: "ALPHA/TRX", base: "ALPHA", quote: "TRX" },
  { symbol: "BTT/BTC", base: "BTT", quote: "BTC" },
  { symbol: "EFI/ETH", base: "EFI", quote: "ETH" },
  { symbol: "XVS/USDT", base: "XVS", quote: "USDT" },
  { symbol: "COTI/XRP", base: "COTI", quote: "XRP" },
  { symbol: "FIDA/SOL", base: "FIDA", quote: "SOL" },
  { symbol: "CELO/BNB", base: "CELO", quote: "BNB" },
  { symbol: "GLMR/USDC", base: "GLMR", quote: "USDC" },
  { symbol: "SUPER/DOGE", base: "SUPER", quote: "DOGE" },
  { symbol: "TRAC/ADA", base: "TRAC", quote: "ADA" },
  { symbol: "ERG/BTC", base: "ERG", quote: "BTC" },
  { symbol: "XDC/ETH", base: "XDC", quote: "ETH" },
  { symbol: "TWT/USDT", base: "TWT", quote: "USDT" },
  { symbol: "RSR/XRP", base: "RSR", quote: "XRP" },
  { symbol: "SPELL/BNB", base: "SPELL", quote: "BNB" },
  { symbol: "METIS/SOL", base: "METIS", quote: "SOL" },
  { symbol: "CVP/USDC", base: "CVP", quote: "USDC" },
  { symbol: "ONT/DOGE", base: "ONT", quote: "DOGE" },
  { symbol: "ARKM/ADA", base: "ARKM", quote: "ADA" },
  { symbol: "WOO/TRX", base: "WOO", quote: "TRX" },
  { symbol: "BAND/BTC", base: "BAND", quote: "BTC" },
  { symbol: "1INCH/ETH", base: "1INCH", quote: "ETH" },
  { symbol: "GMX/USDT", base: "GMX", quote: "USDT" },
  { symbol: "CKB/XRP", base: "CKB", quote: "XRP" },
  { symbol: "XRD/BNB", base: "XRD", quote: "BNB" },
  { symbol: "ENJ/SOL", base: "ENJ", quote: "SOL" },
  { symbol: "NEO/USDC", base: "NEO", quote: "USDC" },
  { symbol: "BLUR/DOGE", base: "BLUR", quote: "DOGE" },
  { symbol: "OCEAN/ADA", base: "OCEAN", quote: "ADA" },
  { symbol: "ZEC/TRX", base: "ZEC", quote: "TRX" },
  { symbol: "ROSE/BTC", base: "ROSE", quote: "BTC" },
  { symbol: "IOTA/ETH", base: "IOTA", quote: "ETH" },
  { symbol: "WLD/USDT", base: "WLD", quote: "USDT" },
  { symbol: "KAVA/XRP", base: "KAVA", quote: "XRP" },
  { symbol: "HNT/BNB", base: "HNT", quote: "BNB" },
  { symbol: "MINA/SOL", base: "MINA", quote: "SOL" },
  { symbol: "DYDX/USDC", base: "DYDX", quote: "USDC" },
  { symbol: "GALA/DOGE", base: "GALA", quote: "DOGE" },
  { symbol: "CAKE/ADA", base: "CAKE", quote: "ADA" },
  { symbol: "RPL/TRX", base: "RPL", quote: "TRX" },
  { symbol: "MANA/BTC", base: "MANA", quote: "BTC" },
  { symbol: "EOS/ETH", base: "EOS", quote: "ETH" },
  { symbol: "APE/USDT", base: "APE", quote: "USDT" },
  { symbol: "AXS/XRP", base: "AXS", quote: "XRP" },
  { symbol: "CRV/BNB", base: "CRV", quote: "BNB" },
  { symbol: "TIA/SOL", base: "TIA", quote: "SOL" },
  { symbol: "BSV/USDC", base: "BSV", quote: "USDC" },
  { symbol: "XTZ/DOGE", base: "XTZ", quote: "DOGE" },
  { symbol: "FLOW/ADA", base: "FLOW", quote: "ADA" },
  { symbol: "THETA/TRX", base: "THETA", quote: "TRX" },
  { symbol: "FTM/BTC", base: "FTM", quote: "BTC" },
  { symbol: "QNT/ETH", base: "QNT", quote: "ETH" },
  { symbol: "STX/USDT", base: "STX", quote: "USDT" },
  { symbol: "KAS/XRP", base: "KAS", quote: "XRP" },
  { symbol: "ALGO/BNB", base: "ALGO", quote: "BNB" },
  { symbol: "SUI/SOL", base: "SUI", quote: "SOL" },
  { symbol: "AAVE/USDC", base: "AAVE", quote: "USDC" },
  { symbol: "GRT/DOGE", base: "GRT", quote: "DOGE" },
  { symbol: "INJ/ADA", base: "INJ", quote: "ADA" },
  { symbol: "MKR/TRX", base: "MKR", quote: "TRX" },
  { symbol: "IMX/BTC", base: "IMX", quote: "BTC" },
  { symbol: "VET/ETH", base: "VET", quote: "ETH" },
  { symbol: "HBAR/USDT", base: "HBAR", quote: "USDT" },
  { symbol: "RNDR/XRP", base: "RNDR", quote: "XRP" },
  { symbol: "XMR/BNB", base: "XMR", quote: "BNB" },
  { symbol: "OP/SOL", base: "OP", quote: "SOL" },
  { symbol: "ARB/USDC", base: "ARB", quote: "USDC" },
  { symbol: "LDO/DOGE", base: "LDO", quote: "DOGE" },
  { symbol: "XLM/ADA", base: "XLM", quote: "ADA" },
  { symbol: "APT/TRX", base: "APT", quote: "TRX" },
  { symbol: "ICP/BTC", base: "ICP", quote: "BTC" },
  { symbol: "UNI/ETH", base: "UNI", quote: "ETH" },
  { symbol: "NEAR/USDT", base: "NEAR", quote: "USDT" },
  { symbol: "BCH/XRP", base: "BCH", quote: "XRP" },
  { symbol: "LTC/BNB", base: "LTC", quote: "BNB" },
  { symbol: "MATIC/SOL", base: "MATIC", quote: "SOL" },
  { symbol: "LINK/USDC", base: "LINK", quote: "USDC" },
  { symbol: "DOT/DOGE", base: "DOT", quote: "DOGE" },
  { symbol: "SHIB/ADA", base: "SHIB", quote: "ADA" },
  { symbol: "AVAX/TRX", base: "AVAX", quote: "TRX" },
  { symbol: "TON/ETH", base: "TON", quote: "ETH" },
  { symbol: "ZEC/BTC", base: "ZEC", quote: "BTC" },
  { symbol: "IOTA/USDT", base: "IOTA", quote: "USDT" },
  { symbol: "WLD/XRP", base: "WLD", quote: "XRP" },
  { symbol: "KAVA/BNB", base: "KAVA", quote: "BNB" },
  { symbol: "HNT/SOL", base: "HNT", quote: "SOL" },
  { symbol: "MINA/USDC", base: "MINA", quote: "USDC" },
  { symbol: "DYDX/DOGE", base: "DYDX", quote: "DOGE" },
  { symbol: "GALA/ADA", base: "GALA", quote: "ADA" },
  { symbol: "CAKE/TRX", base: "CAKE", quote: "TRX" },
  { symbol: "RPL/BTC", base: "RPL", quote: "BTC" },
  { symbol: "MANA/ETH", base: "MANA", quote: "ETH" }
];

    console.log('Available Trading Pairs initialized:', AVAILABLE_TRADING_PAIRS);
  } catch (error) {
    console.error('Error initializing trading pairs:', error);
  }
}

// Call this function when your server starts 
initializeTradingPairs();

exports.getAvailableTradingPairs = async (req, res) => {
  res.json(formatResponse(true, 'Available trading pairs retrieved', AVAILABLE_TRADING_PAIRS));
};

exports.swapCurrency = async (req, res) => {
  const session = await Wallet.startSession();
  session.startTransaction();

  try {
    const { baseCurrency, quoteCurrency, amount } = req.body;
    const userId = req.user._id;
    const numericAmount = new Decimal(amount);

    // Validate currencies and amount
    const baseCurrencyData = await validateCurrency(baseCurrency);
    const quoteCurrencyData = await validateCurrency(quoteCurrency);
    if (numericAmount.lessThanOrEqualTo(0)) {
      return res.status(400).json(formatResponse(false, 'Amount must be positive'));
    }

    // Check if the trading pair is available (optional, but recommended)
    const isPairAvailable = AVAILABLE_TRADING_PAIRS.some(
      pair => (pair.base === baseCurrency && pair.quote === quoteCurrency) || (pair.base === quoteCurrency && pair.quote === baseCurrency)
    );
    if (!isPairAvailable) {
      return res.status(400).json(formatResponse(false, `Trading pair ${baseCurrency}/${quoteCurrency} is not available`));
    }

    const wallet = await Wallet.findOne({ userId }).session(session);
    if (!wallet) {
      return res.status(404).json(formatResponse(false, 'Wallet not found'));
    }

    const baseBalance = new Decimal(wallet.balances.get(baseCurrency) || 0);
    if (baseBalance.lessThan(numericAmount)) {
      return res.status(400).json(formatResponse(false, `Insufficient ${baseCurrency} balance`));
    }

    // Simulate the swap - for simplicity, let's use a fixed exchange rate (you'd likely fetch this from an API)
    const exchangeRate = await getSimulatedExchangeRate(baseCurrency, quoteCurrency);
    const receivedAmount = numericAmount.times(exchangeRate);

    // Update balances
    await wallet.updateBalance(baseCurrency, numericAmount.negated(), 'decrement', session); // Decrement base currency
    await wallet.updateBalance(quoteCurrency, receivedAmount.toNumber(), 'increment', session); // Increment quote currency

    // Record the transaction
    await Transaction.create({
      userId,
      walletId: wallet._id,
      type: 'swap',
      baseCurrency,
      quoteCurrency,
      amount: numericAmount.toNumber(),
      receivedAmount: receivedAmount.toNumber(),
      rate: exchangeRate,
      status: 'COMPLETED',
      timestamp: new Date()
    }, { session });

    await session.commitTransaction();
    res.json(formatResponse(true, 'Swap successful', { receivedAmount: receivedAmount.toNumber() }));

  } catch (error) {
    await session.abortTransaction();
    logger.error(`Swap error: ${error.message}`);
    res.status(400).json(formatResponse(false, error.message));
  } finally {
    session.endSession();
  }
};

// Dummy function for getting a simulated exchange rate
async function getSimulatedExchangeRate(base, quote) {
  // In a real app, you'd fetch this from an exchange API
  if ((base === 'BTC' && quote === 'USD') || (base === 'USD' && quote === 'BTC')) return 30000;
  if ((base === 'ETH' && quote === 'USD') || (base === 'USD' && quote === 'ETH')) return 2000;
  if (base === 'ETH' && quote === 'BTC') return 0.067;
  if (base === 'BTC' && quote === 'ETH') return 1 / 0.067;
  // Add more simulated rates as needed
  return Math.random() * 100; // Default random rate for other pairs
}



// In-memory order books (for simulation purposes)
const orderBooks = {};

const getOrderBook = (pair) => {
  if (!orderBooks[pair]) {
    orderBooks[pair] = {
      buyOrders: [], // Array of { userId, price, amount } sorted by price (descending)
      sellOrders: [], // Array of { userId, price, amount } sorted by price (ascending)
    };
  }
  return orderBooks[pair];
};

// Function to sort buy orders by price (highest first)
const sortBuyOrders = (a, b) => new Decimal(b.price).minus(a.price).toNumber();

// Function to sort sell orders by price (lowest first)
const sortSellOrders = (a, b) => new Decimal(a.price).minus(b.price).toNumber();

exports.getExchangePairs = async (req, res) => {
  try {
    res.json(formatResponse(true, 'Available trading pairs retrieved successfully', AVAILABLE_TRADING_PAIRS));
  } catch (error) {
    logger.error(`Error fetching exchange pairs: ${error.message}`);
    res.status(500).json(formatResponse(false, 'Server error while fetching exchange pairs'));
  }
};

exports.placeOrder = async (req, res) => {
  const session = await Wallet.startSession();
  session.startTransaction();

  try {
    const { pair, type, amount, price } = req.body;
    const userId = req.user._id;

    if (!pair || !type || !amount || !price) {
      throw new Error('Missing required order parameters');
    }

    if (!AVAILABLE_TRADING_PAIRS.some(p => p.symbol === pair)) {
      throw new Error(`Invalid trading pair: ${pair}`);
    }

    const numericAmount = new Decimal(amount);
    const numericPrice = new Decimal(price);

    if (numericAmount.lessThanOrEqualTo(0) || numericPrice.lessThanOrEqualTo(0)) {
      throw new Error('Amount and price must be positive');
    }

    const wallet = await Wallet.findOne({ userId }).session(session);
    if (!wallet) {
      throw new Error('Wallet not found');
    }

    const [baseCurrency, quoteCurrency] = pair.split('/');

    // Check for sufficient balance
    if (type.toUpperCase() === 'BUY') {
      const cost = numericAmount.mul(numericPrice);
      const quoteBalance = new Decimal(wallet.balances[quoteCurrency] || 0);
      if (quoteBalance.lessThan(cost)) {
        throw new Error(`Insufficient ${quoteCurrency} balance for buy order`);
      }
      // Reserve the funds (we won't implement actual reservation in this simplified version)
    } else if (type.toUpperCase() === 'SELL') {
      const baseBalance = new Decimal(wallet.balances[baseCurrency] || 0);
      if (baseBalance.lessThan(numericAmount)) {
        throw new Error(`Insufficient ${baseCurrency} balance for sell order`);
      }
      // Reserve the funds
    } else {
      throw new Error('Invalid order type');
    }

    const orderBook = getOrderBook(pair);
    const order = { userId, price: numericPrice.toNumber(), amount: numericAmount.toNumber() };

    if (type.toUpperCase() === 'BUY') {
      orderBook.buyOrders.push(order);
      orderBook.buyOrders.sort(sortBuyOrders);
    } else if (type.toUpperCase() === 'SELL') {
      orderBook.sellOrders.push(order);
      orderBook.sellOrders.sort(sortSellOrders);
    }

    // Basic matching logic (immediate execution if possible)
    await matchOrders(pair, session);

    await session.commitTransaction();
    res.json(formatResponse(true, `Order placed successfully (${type} ${amount} at ${price} ${pair})`));

  } catch (error) {
    await session.abortTransaction();
    logger.error(`Error placing order: ${error.message}`);
    res.status(400).json(formatResponse(false, error.message));
  } finally {
    session.endSession();
  }
};

async function matchOrders(pair, session) {
  const orderBook = getOrderBook(pair);
  const buyOrders = orderBook.buyOrders;
  const sellOrders = orderBook.sellOrders;

  while (buyOrders.length > 0 && sellOrders.length > 0 && new Decimal(buyOrders[0].price).gte(sellOrders[0].price)) {
    const bestBuyOrder = buyOrders[0];
    const bestSellOrder = sellOrders[0];

    const tradeAmount = Math.min(bestBuyOrder.amount, bestSellOrder.amount);
    const tradePrice = bestSellOrder.price; // Use the best sell price for the match

    // Execute trade
    await executeTrade(pair, bestBuyOrder.userId, bestSellOrder.userId, tradeAmount, tradePrice, session);

    // Update order amounts
    bestBuyOrder.amount -= tradeAmount;
    bestSellOrder.amount -= tradeAmount;

    // Remove fully filled orders
    if (bestBuyOrder.amount === 0) {
      buyOrders.shift();
    }
    if (bestSellOrder.amount === 0) {
      sellOrders.shift();
    }
  }
}

async function executeTrade(pair, buyerId, sellerId, amount, price, session) {
  const [baseCurrency, quoteCurrency] = pair.split('/');
  const buyerWallet = await Wallet.findOne({ userId: buyerId }).session(session);
  const sellerWallet = await Wallet.findOne({ userId: sellerId }).session(session);

  if (!buyerWallet || !sellerWallet) {
    logger.error(`Error: Could not find buyer or seller wallet during trade execution.`);
    return;
  }

  const cost = new Decimal(amount).mul(price);
  const received = new Decimal(amount).mul(price);

  // Update buyer's balances
  buyerWallet.balances[quoteCurrency] = new Decimal(buyerWallet.balances[quoteCurrency] || 0).minus(cost).toNumber();
  buyerWallet.balances[baseCurrency] = new Decimal(buyerWallet.balances[baseCurrency] || 0).plus(amount).toNumber();
  buyerWallet.transactions.push({
    type: 'trade',
    pair,
    tradeType: 'BUY',
    amount: amount,
    price: price,
    timestamp: new Date(),
    status: 'COMPLETED',
    counterParty: sellerId
  });
  await buyerWallet.save({ session });

  // Update seller's balances
  sellerWallet.balances[baseCurrency] = new Decimal(sellerWallet.balances[baseCurrency] || 0).minus(amount).toNumber();
  sellerWallet.balances[quoteCurrency] = new Decimal(sellerWallet.balances[quoteCurrency] || 0).plus(received).toNumber();
  sellerWallet.transactions.push({
    type: 'trade',
    pair,
    tradeType: 'SELL',
    amount: amount,
    price: price,
    timestamp: new Date(),
    status: 'COMPLETED',
    counterParty: buyerId
  });
  await sellerWallet.save({ session });
}

exports.getMarketData = async (req, res) => {
  try {
    const { pair } = req.query;
    if (!pair || !AVAILABLE_TRADING_PAIRS.some(p => p.symbol === pair)) {
      return res.status(400).json(formatResponse(false, 'Invalid trading pair'));
    }
    const orderBook = getOrderBook(pair);
    res.json(formatResponse(true, `Order book for ${pair}`, {
      buyOrders: orderBook.buyOrders.slice(0, 10), // Top 10 bids
      sellOrders: orderBook.sellOrders.slice(0, 10), // Top 10 asks
      // You might also include recent trades here in a real platform
    }));
  } catch (error) {
    logger.error(`Error fetching market data: ${error.message}`);
    res.status(500).json(formatResponse(false, 'Server error fetching market data'));
  }
};

// controllers/exchangeController.js
const { formatResponse } = require('../utils/helpers');
const logger = require('../utils/logger');
const Wallet = require('../models/Wallet');
const Decimal = require('decimal.js');

// ... (rest of the existing code: AVAILABLE_TRADING_PAIRS, getOrderBook, sorting functions, getExchangePairs, placeOrder, matchOrders, executeTrade, getMarketData)

exports.swap = async (req, res) => {
  const session = await Wallet.startSession();
  session.startTransaction();

  try {
    const { fromCurrency, toCurrency, amount } = req.body;
    const userId = req.user._id;

    if (!fromCurrency || !toCurrency || !amount) {
      throw new Error('Missing required swap parameters');
    }

    if (fromCurrency === toCurrency) {
      throw new Error('Cannot swap between the same currency');
    }

    const numericAmount = new Decimal(amount);
    if (numericAmount.lessThanOrEqualTo(0)) {
      throw new Error('Amount must be positive');
    }

    const wallet = await Wallet.findOne({ userId }).session(session);
    if (!wallet) {
      throw new Error('Wallet not found');
    }

    const fromBalance = new Decimal(wallet.balances[fromCurrency] || 0);
    if (fromBalance.lessThan(numericAmount)) {
      throw new Error(`Insufficient ${fromCurrency} balance`);
    }

    // Simulate the exchange rate (this would be dynamic in a real system)
    // For now, let's use a static or very basic simulated rate
    const exchangeRate = await getSimulatedExchangeRate(fromCurrency, toCurrency);
    const receivedAmount = numericAmount.mul(exchangeRate);

    // Update balances
    wallet.balances[fromCurrency] = fromBalance.minus(numericAmount).toNumber();
    wallet.balances[toCurrency] = new Decimal(wallet.balances[toCurrency] || 0).plus(receivedAmount).toNumber();

    wallet.transactions.push({
      type: 'swap',
      fromCurrency,
      toCurrency,
      amount: numericAmount.toNumber(),
      received: receivedAmount.toNumber(),
      rate: exchangeRate.toNumber(),
      timestamp: new Date(),
      status: 'COMPLETED'
    });

    await wallet.save({ session });
    await session.commitTransaction();

    res.json(formatResponse(true, 'Swap executed successfully', { receivedAmount: receivedAmount.toNumber() }));

  } catch (error) {
    await session.abortTransaction();
    logger.error(`Swap error: ${error.message}`);
    res.status(400).json(formatResponse(false, error.message));
  } finally {
    session.endSession();
  }
};

// Simple function to simulate exchange rates (replace with more sophisticated logic if needed)
async function getSimulatedExchangeRate(fromCurrency, toCurrency) {
  // This is a very basic simulation. In a real scenario, you might:
  // - Have a predefined set of rates.
  // - Simulate price movements.
  // - Potentially charge a small fee.
  if (fromCurrency === 'BTC' && toCurrency === 'ETH') {
    return new Decimal(20); // Example: 1 BTC = 20 ETH
  } else if (fromCurrency === 'ETH' && toCurrency === 'BTC') {
    return new Decimal(0.05); // Example: 1 ETH = 0.05 BTC
  } else if (fromCurrency === 'UNI' && toCurrency === 'ETH') {
    return new Decimal(2.261723); // Example from your screenshot
  } else if (fromCurrency === 'ETH' && toCurrency === 'UNI') {
    return new Decimal(1).div(2.261723);
  } else if (fromCurrency === 'BTC' && toCurrency === 'USD') {
    return new Decimal(60000);
  } else if (fromCurrency === 'USD' && toCurrency === 'BTC') {
    return new Decimal(1).div(60000);
  }
  // Add more simulated rates as needed
  return new Decimal(1); // Default to 1:1 if no specific rate is defined
}
