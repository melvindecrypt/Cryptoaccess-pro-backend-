// controllers/exchangeController.js
import { formatResponse } from '../utils/helpers.js';
import logger from '../utils/logger.js';
import Wallet from '../models/wallet.js';
import Decimal from 'decimal.js';
import Currency from '../models/currency.js';
import Transaction from '../models/transaction.js';
import { getSimulatedBidAskPrices, AVAILABLE_TRADING_PAIRS, getSimulatedExchangeRate } from '../utils/exchangeUtils.js';

// 1. Global variable to store available trading pairs
let AVAILABLE_TRADING_PAIRS = [];

// 2. Helper function to validate if a currency is active
const validateCurrency = async (currencySymbol) => {
  // Ensure the symbol is consistently uppercase for lookup
  const symbolUpper = currencySymbol.toUpperCase();
  const currencyData = await Currency.findOne({ symbol: symbolUpper, isActive: true });
  if (!currencyData) {
    logger.warn(`Attempted operation with inactive or non-existent currency: ${symbolUpper}`);
    throw new Error(`Unsupported currency: ${currencySymbol}`);
  }
  return currencyData; // Return currency data if needed elsewhere
};

// 3. Initialization function for trading pairs
async function initializeTradingPairs() {
  try {
    const activeCurrencies = await Currency.find({ isActive: true }).select('symbol').lean();
    const baseCurrency = 'USD'; // Your primary base currency, e.g., 'USD', 'USDT'
    // Generate base pairs (e.g., BTC/USD, ETH/USD)
    const basePairs = activeCurrencies
      .filter(currency => currency.symbol !== baseCurrency)
      .map(currency => ({
        symbol: `${currency.symbol}/${baseCurrency}`,
        base: currency.symbol,
        quote: baseCurrency
      }));
    // Manually defined cross-pairs (ensure consistency in symbol naming)
    const crossPairs = [
      { symbol: "AVAX/BTC", base: "AVAX", quote: "BTC" },
      { symbol: "SHIB/ETH", base: "SHIB", quote: "ETH" },
      { symbol: "DOT/USDT", base: "DOT", quote: "USDT" },
      { symbol: "LINK/XRP", base: "LINK", quote: "XRP" },
      { symbol: "MATIC/BNB", base: "MATIC", quote: "BNB" },
      { symbol: "LTC/SOL", base: "LTC", quote: "SOL" },
      { symbol: "BCH/USDC", base: "BCH", quote: "USDC" },
      { symbol: "NEAR/DOGE", base: "NEAR", quote: "DOGE" },
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
  { symbol: "AAVE/XRP", base: "AAVE", quote: "XRP" },
  { symbol: "SUI/BNB", base: "SUI", quote: "BNB" },
  { symbol: "BTC/USDT", base: "BTC", quote: "USDT" },
  { symbol: "ETH/BTC", base: "ETH", quote: "BTC" },
  { symbol: "BNB/USDT", base: "BNB", quote: "USDT" },
  { symbol: "SOL/BTC", base: "SOL", quote: "BTC" },
  { symbol: "DOGE/USDT", base: "DOGE", quote: "USDT" },
  { symbol: "ADA/USDT", base: "ADA", quote: "USDT" },
  { symbol: "TRX/USDT", base: "TRX", quote: "USDT" },
  { symbol: "XRP/BTC", base: "XRP", quote: "BTC" },
  { symbol: "SHIB/USDT", base: "SHIB", quote: "USDT" },
  { symbol: "LTC/USDT", base: "LTC", quote: "USDT" },
  { symbol: "AVAX/USDT", base: "AVAX", quote: "USDT" },
  { symbol: "MATIC/USDT", base: "MATIC", quote: "USDT" },
  { symbol: "DOT/BTC", base: "DOT", quote: "BTC" },
  { symbol: "TON/USDT", base: "TON", quote: "USDT" },
  { symbol: "NEAR/USDT", base: "NEAR", quote: "USDT" },
  { symbol: "LINK/ETH", base: "LINK", quote: "ETH" },
  { symbol: "OP/USDT", base: "OP", quote: "USDT" },
  { symbol: "ARB/USDT", base: "ARB", quote: "USDT" },
  { symbol: "MNT/BTC", base: "MNT", quote: "BTC" },
  { symbol: "DAI/USDT", base: "DAI", quote: "USDT" },
  { symbol: "UNI/USDT", base: "UNI", quote: "USDT" },
  { symbol: "ATOM/USDT", base: "ATOM", quote: "USDT" },
  { symbol: "ICP/USDT", base: "ICP", quote: "USDT" },
  { symbol: "VET/USDT", base: "VET", quote: "USDT" },
  { symbol: "FIL/USDT", base: "FIL", quote: "USDT" },
  { symbol: "ETC/USDT", base: "ETC", quote: "USDT" },
  { symbol: "HBAR/USDT", base: "HBAR", quote: "USDT" },
  { symbol: "XLM/USDT", base: "XLM", quote: "USDT" },
  { symbol: "ALGO/USDT", base: "ALGO ", quote: "USDT " },
  { symbol: "EGLD/USDT ", base: "EGLD ", quote: " USDT " },
  { symbol: "FLOW/USDT ", base: "FLOW ", quote: "USDT " },
  { symbol: "THETA/USDT ", base: "THETA ", quote: " USDT " },
  { symbol: "APE/USDT ", base: "APE ", quote: " USDT " },
  { symbol: "AXS/USDT ", base: "AXS ", quote: " USDT " },
  { symbol: "SAND/USDT ", base: "SAND ", quote: " USDT " },
  { symbol: "MANA/USDT ", base: "MANA ", quote: " USDT " },
  { symbol: "ENJ/USDT ", base: "ENJ ", quote: " USDT " },
  { symbol: "CHZ/USDT ", base: "CHZ ", quote: " USDT " },
  { symbol: "GRT/USDT ", base: "GRT ", quote: " USDT " },
  { symbol: "AAVE/USDT ", base: "AAVE ", quote: " USDT " },
  { symbol: "COMP/USDT ", base: "COMP ", quote: " USDT " },
  { symbol: "MKR/USDT ", base: "MKR ", quote: " " },
  { symbol: "SUSHI/USDT ", base: "SUSHI ", quote: " USDT " },
  { symbol: "UNI/ETH", base: "UNI", quote: "ETH" },
  { symbol: "DOT/USDT", base: "DOT", quote: "USDT" },
  { symbol: "ARB/ETH", base: "ARB ", quote: "ETH" },
  { symbol: "OP/ETH ", base: "OP ", quote: "ETH " },
  { symbol: "NEAR/BTC ", base: "NEAR ", quote: " BTC " },
  { symbol: "TON/BTC ", base: "TON ", quote: "BTC " },
  { symbol: "LTC/BTC", base: "LTC", quote: "BTC" }
];
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
    AVAILABLE_TRADING_PAIRS = [...basePairs, ...crossPairs];
    logger.info('Available Trading Pairs initialized:', AVAILABLE_TRADING_PAIRS.length, 'pairs.');
  } catch (error) {
    logger.error('Error initializing trading pairs:', error);
  }
}

// Call this function when your server starts
initializeTradingPairs();

// 4. Helper function for simulated exchange rates
async function getSimulatedExchangeRate(fromCurrency, toCurrency) {
  const rates = {
    // Base currency pairs (e.g., against USD or USDT for stable value reference)
    'BTC/USD': new Decimal(68000), 'USD/BTC': new Decimal(1).div(68000),
    'ETH/USD': new Decimal(3500), 'USD/ETH': new Decimal(1).div(3500),
    'USDT/USD': new Decimal(1), 'USD/USDT': new Decimal(1), // Stablecoin peg
    'BTC/USDT': new Decimal(68000), 'USDT/BTC': new Decimal(1).div(68000),
    'BNB/USDT': new Decimal(600), 'USDT/BNB': new Decimal(1).div(600),
    'DOGE/USDT': new Decimal(0.15), 'USDT/DOGE': new Decimal(1).div(0.15),
    'ADA/USDT': new Decimal(0.45), 'USDT/ADA': new Decimal(1).div(0.45),
    'TRX/USDT': new Decimal(0.13), 'USDT/TRX': new Decimal(1).div(0.13),
    'SHIB/USDT': new Decimal(0.000018), 'USDT/SHIB': new Decimal(1).div(0.000018),
    'LTC/USDT': new Decimal(80), 'USDT/LTC': new Decimal(1).div(80),
    'AVAX/USDT': new Decimal(30), 'USDT/AVAX': new Decimal(1).div(30),
    'MATIC/USDT': new Decimal(0.55), 'USDT/MATIC': new Decimal(1).div(0.55),
    'TON/USDT': new Decimal(7), 'USDT/TON': new Decimal(1).div(7),
    'NEAR/USDT': new Decimal(5), 'USDT/NEAR': new Decimal(1).div(5),
    'OP/USDT': new Decimal(1.8), 'USDT/OP': new Decimal(1).div(1.8),
    'ARB/USDT': new Decimal(0.8), 'USDT/ARB': new Decimal(1).div(0.8),
    'DAI/USDT': new Decimal(1), 'USDT/DAI': new Decimal(1), // Stablecoin peg
    'UNI/USDT': new Decimal(8), 'USDT/UNI': new Decimal(1).div(8),
    'ATOM/USDT': new Decimal(6), 'USDT/ATOM': new Decimal(1).div(6),
    'ICP/USDT': new Decimal(9), 'USDT/ICP': new Decimal(1).div(9),
    'VET/USDT': new Decimal(0.03), 'USDT/VET': new Decimal(1).div(0.03),
    'FIL/USDT': new Decimal(4.5), 'USDT/FIL': new Decimal(1).div(4.5),
    'ETC/USDT': new Decimal(22), 'USDT/ETC': new Decimal(1).div(22),
    'HBAR/USDT': new Decimal(0.08), 'USDT/HBAR': new Decimal(1).div(0.08),
    'XLM/USDT': new Decimal(0.1), 'USDT/XLM': new Decimal(1).div(0.1),
    'ALGO/USDT': new Decimal(0.14), 'USDT/ALGO': new Decimal(1).div(0.14),
    'EGLD/USDT': new Decimal(30), 'USDT/EGLD': new Decimal(1).div(30),
    'FLOW/USDT': new Decimal(0.6), 'USDT/FLOW': new Decimal(1).div(0.6),
    'THETA/USDT': new Decimal(1.5), 'USDT/THETA': new Decimal(1).div(1.5),
    'APE/USDT': new Decimal(0.9), 'USDT/APE': new Decimal(1).div(0.9),
    'AXS/USDT': new Decimal(5), 'USDT/AXS': new Decimal(1).div(5),
    'SAND/USDT': new Decimal(0.32), 'USDT/SAND': new Decimal(1).div(0.32),
    'MANA/USDT': new Decimal(0.35), 'USDT/MANA': new Decimal(1).div(0.35),
    'ENJ/USDT': new Decimal(0.18), 'USDT/ENJ': new Decimal(1).div(0.18),
    'CHZ/USDT': new Decimal(0.07), 'USDT/CHZ': new Decimal(1).div(0.07),
    'GRT/USDT': new Decimal(0.2), 'USDT/GRT': new Decimal(1).div(0.2),
    'AAVE/USDT': new Decimal(100), 'USDT/AAVE': new Decimal(1).div(100),
    'COMP/USDT': new Decimal(50), 'USDT/COMP': new Decimal(1).div(50),
    'MKR/USDT': new Decimal(2500), 'USDT/MKR': new Decimal(1).div(2500),
    'SUSHI/USDT': new Decimal(0.7), 'USDT/SUSHI': new Decimal(1).div(0.7),
    'DOT/USDT': new Decimal(6), 'USDT/DOT': new Decimal(1).div(6),
    'ETH/BTC': new Decimal(3500).div(68000), 'BTC/ETH': new Decimal(68000).div(3500), // ≈ 0.05147
    'SOL/BTC': new Decimal(150).div(68000), 'BTC/SOL': new Decimal(68000).div(150), // SOL/USD ≈ 150
    'XRP/BTC': new Decimal(0.5).div(68000), 'BTC/XRP': new Decimal(68000).div(0.5), // XRP/USD ≈ 0.5
    'DOT/BTC': new Decimal(6).div(68000), 'BTC/DOT': new Decimal(68000).div(6), // DOT/USD ≈ 6
    'MNT/BTC': new Decimal(0.6).div(68000), 'BTC/MNT': new Decimal(68000).div(0.6), // MNT/USD ≈ 0.6
    'NEAR/BTC': new Decimal(5).div(68000), 'BTC/NEAR': new Decimal(68000).div(5), // NEAR/USD ≈ 5
    'TON/BTC': new Decimal(7).div(68000), 'BTC/TON': new Decimal(68000).div(7), // TON/USD ≈ 7
    'LTC/BTC': new Decimal(80).div(68000), 'BTC/LTC': new Decimal(68000).div(80), // LTC/USD ≈ 80
    'LINK/ETH': new Decimal(14).div(3500), 'ETH/LINK': new Decimal(3500).div(14), // LINK/USD ≈ 14
    'UNI/ETH': new Decimal(8).div(3500), 'ETH/UNI': new Decimal(3500).div(8), // UNI/USD ≈ 8
    'ARB/ETH': new Decimal(0.8).div(3500), 'ETH/ARB': new Decimal(3500).div(0.8), // ARB/USD ≈ 0.8
    'OP/ETH': new Decimal(1.8).div(3500), 'ETH/OP': new Decimal(3500).div(1.8), // OP/USD ≈ 1.8
    'USDC/USD': new Decimal(1), 'USD/USDC': new Decimal(1), // Stablecoin peg
    'AVAX/BTC': new Decimal(0.0006), 'BTC/AVAX': new Decimal(1).div(0.0006),
    'SHIB/ETH': new Decimal(0.0000000045), 'ETH/SHIB': new Decimal(1).div(0.0000000045),
    'DOT/USDT': new Decimal(7.2), 'USDT/DOT': new Decimal(1).div(7.2),
    'LINK/XRP': new Decimal(25), 'XRP/LINK': new Decimal(1).div(25),
        'MATIC/BNB': new Decimal(0.002), 'BNB/MATIC': new Decimal(1).div(0.002),
        'LTC/SOL': new Decimal(0.02), 'SOL/LTC': new Decimal(1).div(0.02),
        'BCH/USDC': new Decimal(450), 'USDC/BCH': new Decimal(1).div(450),
        'NEAR/DOGE': new Decimal(60), 'DOGE/NEAR': new Decimal(1).div(60),
        'UNI/ADA': new Decimal(8), 'ADA/UNI': new Decimal(1).div(8),
        'ICP/TRX': new Decimal(150), 'TRX/ICP': new Decimal(1).div(150),
        'APT/BTC': new Decimal(0.00015), 'BTC/APT': new Decimal(1).div(0.00015),
        'XLM/ETH': new Decimal(0.000025), 'ETH/XLM': new Decimal(1).div(0.000025),
        'LDO/USDT': new Decimal(2.8), 'USDT/LDO': new Decimal(1).div(2.8),
        'ARB/XRP': new Decimal(2.5), 'XRP/ARB': new Decimal(1).div(2.5),
        'OP/BNB': new Decimal(0.005), 'BNB/OP': new Decimal(1).div(0.005),
        'XMR/SOL': new Decimal(0.015), 'SOL/XMR': new Decimal(1).div(0.015),
        'RNDR/USDC': new Decimal(9.5), 'USDC/RNDR': new Decimal(1).div(9.5),
        'HBAR/DOGE': new Decimal(2.5), 'DOGE/HBAR': new Decimal(1).div(2.5),
        'VET/ADA': new Decimal(0.5), 'ADA/VET': new Decimal(1).div(0.5),
        'IMX/TRX': new Decimal(10), 'TRX/IMX': new Decimal(1).div(10),
        'MKR/BTC': new Decimal(0.004), 'BTC/MKR': new Decimal(1).div(0.004),
        'INJ/ETH': new Decimal(0.008), 'ETH/INJ': new Decimal(1).div(0.008),
        'GRT/USDT': new Decimal(0.25), 'USDT/GRT': new Decimal(1).div(0.25),
        'AAVE/XRP': new Decimal(150), 'XRP/AAVE': new Decimal(1).div(150),
        'SUI/BNB': new Decimal(0.0018), 'BNB/SUI': new Decimal(1).div(0.0018),
        'ALGO/SOL': new Decimal(0.005), 'SOL/ALGO': new Decimal(1).div(0.005),
        'KAS/USDC': new Decimal(0.15), 'USDC/KAS': new Decimal(1).div(0.15),
        'STX/DOGE': new Decimal(12), 'DOGE/STX': new Decimal(1).div(12),
        'QNT/ADA': new Decimal(100), 'ADA/QNT': new Decimal(1).div(100),
        'FTM/TRX': new Decimal(15), 'TRX/FTM': new Decimal(1).div(15),
        'THETA/BTC': new Decimal(0.00008), 'BTC/THETA': new Decimal(1).div(0.00008),
        'FLOW/ETH': new Decimal(0.0004), 'ETH/FLOW': new Decimal(1).div(0.0004),
        'XTZ/USDT': new Decimal(1.1), 'USDT/XTZ': new Decimal(1).div(1.1),
        'BSV/XRP': new Decimal(400), 'XRP/BSV': new Decimal(1).div(400),
        'TIA/BNB': new Decimal(0.006), 'BNB/TIA': new Decimal(1).div(0.006),
        'CRV/SOL': new Decimal(0.008), 'SOL/CRV': new Decimal(1).div(0.008),
        'AXS/USDC': new Decimal(7.8), 'USDC/AXS': new Decimal(1).div(7.8),
        'APE/DOGE': new Decimal(50), 'DOGE/APE': new Decimal(1).div(50),
        'EOS/ADA': new Decimal(3), 'ADA/EOS': new Decimal(1).div(3),
        'MANA/TRX': new Decimal(20), 'TRX/MANA': new Decimal(1).div(20),
        'RPL/BTC': new Decimal(0.003), 'BTC/RPL': new Decimal(1).div(0.003),
        'CAKE/ETH': new Decimal(0.0006), 'ETH/CAKE': new Decimal(1).div(0.0006),
        'GALA/USDT': new Decimal(0.04), 'USDT/GALA': new Decimal(1).div(0.04),
        'DYDX/XRP': new Decimal(5.5), 'XRP/DYDX': new Decimal(1).div(5.5),
        'MINA/BNB': new Decimal(0.0008), 'BNB/MINA': new Decimal(1).div(0.0008),
        'HNT/SOL': new Decimal(0.002), 'SOL/HNT': new Decimal(1).div(0.002),
        'KAVA/USDC': new Decimal(0.6), 'USDC/KAVA': new Decimal(1).div(0.6),
        'WLD/DOGE': new Decimal(120), 'DOGE/WLD': new Decimal(1).div(120),
        'IOTA/ADA': new Decimal(0.8), 'ADA/IOTA': new Decimal(1).div(0.8),
        'ROSE/TRX': new Decimal(3), 'TRX/ROSE': new Decimal(1).div(3),
        'ZEC/BTC': new Decimal(0.002), 'BTC/ZEC': new Decimal(1).div(0.002),
        'OCEAN/ETH': new Decimal(0.0003), 'ETH/OCEAN': new Decimal(1).div(0.0003),
        'BLUR/USDT': new Decimal(0.4), 'USDT/BLUR': new Decimal(1).div(0.4),
        'NEO/XRP': new Decimal(15), 'XRP/NEO': new Decimal(1).div(15),
        'ENJ/BNB': new Decimal(0.001), 'BNB/ENJ': new Decimal(1).div(0.001),
        'XRD/SOL': new Decimal(0.003), 'SOL/XRD': new Decimal(1).div(0.003),
        'CKB/USDC': new Decimal(0.008), 'USDC/CKB': new Decimal(1).div(0.008),
        'GMX/DOGE': new Decimal(150), 'DOGE/GMX': new Decimal(1).div(150),
        '1INCH/ADA': new Decimal(1.2), 'ADA/1INCH': new Decimal(1).div(1.2),
        'BAND/TRX': new Decimal(5), 'TRX/BAND': new Decimal(1).div(5),
        'WOO/BTC': new Decimal(0.00005), 'BTC/WOO': new Decimal(1).div(0.00005),
        'ARKM/ETH': new Decimal(0.0002), 'ETH/ARKM': new Decimal(1).div(0.0002),
        'ONT/USDT': new Decimal(0.3), 'USDT/ONT': new Decimal(1).div(0.3),
        'CVP/XRP': new Decimal(10), 'XRP/CVP': new Decimal(1).div(10),
        'METIS/BNB': new Decimal(0.008), 'BNB/METIS': new Decimal(1).div(0.008),
        'SPELL/SOL': new Decimal(0.0000008), 'SOL/SPELL': new Decimal(1).div(0.0000008),
        'RSR/USDC': new Decimal(0.002), 'USDC/RSR': new Decimal(1).div(0.002),
        'TWT/DOGE': new Decimal(5), 'DOGE/TWT': new Decimal(1).div(5),
        'XDC/ADA': new Decimal(0.005), 'ADA/XDC': new Decimal(1).div(0.005),
        'ERG/TRX': new Decimal(8), 'TRX/ERG': new Decimal(1).div(8),
        'TRAC/BTC': new Decimal(0.000005), 'BTC/TRAC': new Decimal(1).div(0.000005),
        'SUPER/ETH': new Decimal(0.0001), 'ETH/SUPER': new Decimal(1).div(0.0001),
        'GLMR/USDT': new Decimal(0.35), 'USDT/GLMR': new Decimal(1).div(0.35),
        'CELO/XRP': new Decimal(2), 'XRP/CELO': new Decimal(1).div(2),
        'FIDA/BNB': new Decimal(0.0002), 'BNB/FIDA': new Decimal(1).div(0.0002),
        'COTI/SOL': new Decimal(0.00005), 'SOL/COTI': new Decimal(1).div(0.00005),
        'XVS/USDC': new Decimal(6.5), 'USDC/XVS': new Decimal(1).div(6.5),
        'EFI/DOGE': new Decimal(2), 'DOGE/EFI': new Decimal(1).div(2),
        'BTT/ADA': new Decimal(0.000000002), 'ADA/BTT': new Decimal(1).div(0.000000002),
        'ALPHA/TRX': new Decimal(5), 'TRX/ALPHA': new Decimal(1).div(5),
        'BADGER/BTC': new Decimal(0.0001), 'BTC/BADGER': new Decimal(1).div(0.0001),
        'STRAX/ETH': new Decimal(0.00005), 'ETH/STRAX': new Decimal(1).div(0.00005),
        'XPRT/USDT': new Decimal(0.4), 'USDT/XPRT': new Decimal(1).div(0.4),
        'ALCX/XRP': new Decimal(100), 'XRP/ALCX': new Decimal(1).div(100),
        'SNX/BNB': new Decimal(0.008), 'BNB/SNX': new Decimal(1).div(0.008),
        'NYM/SOL': new Decimal(0.001), 'SOL/NYM': new Decimal(1).div(0.001),
        'VIC/USDC': new Decimal(0.2), 'USDC/VIC': new Decimal(1).div(0.2),
        'ASTR/DOGE': new Decimal(3), 'DOGE/ASTR': new Decimal(1).div(3),
        'PUNDIX/ADA': new Decimal(0.5), 'ADA/PUNDIX': new Decimal(1).div(0.5),
        'TON/BTC': new Decimal(0.0001), 'BTC/TON': new Decimal(1).div(0.0001),
        'LDO/ETH': new Decimal(0.0008), 'ETH/LDO': new Decimal(1).div(0.0008),
        'HBAR/USDT': new Decimal(0.12), 'USDT/HBAR': new Decimal(1).div(0.12),
        'VET/XRP': new Decimal(0.8), 'XRP/VET': new Decimal(1).div(0.8),
        'INJ/BNB': new Decimal(0.006), 'BNB/INJ': new Decimal(1).div(0.006),
        'GRT/SOL': new Decimal(0.0001), 'SOL/GRT': new Decimal(1).div(0.0001),
        'SUI/USDC': new Decimal(1.2), 'USDC/SUI': new Decimal(1).div(1.2),
        'KAS/DOGE': new Decimal(2), 'DOGE/KAS': new Decimal(1).div(2),
        // QNT/ADA, FTM/TRX, THETA/BTC are duplicated in the initial list, but handled by the lookup.
        'PUNDIX/BTC': new Decimal(0.00005), 'BTC/PUNDIX': new Decimal(1).div(0.00005),
        'ASTR/ETH': new Decimal(0.0009), 'ETH/ASTR': new Decimal(1).div(0.0009),
        'VIC/USDT': new Decimal(0.2), 'USDT/VIC': new Decimal(1).div(0.2),
        'NYM/XRP': new Decimal(1.5), 'XRP/NYM': new Decimal(1).div(1.5),
        'SNX/SOL': new Decimal(0.005), 'SOL/SNX': new Decimal(1).div(0.005),
        'ALCX/BNB': new Decimal(0.05), 'BNB/ALCX': new Decimal(1).div(0.05),
        'XPRT/USDC': new Decimal(0.4), 'USDC/XPRT': new Decimal(1).div(0.4),
        'STRAX/DOGE': new Decimal(10), 'DOGE/STRAX': new Decimal(1).div(10),
        'BADGER/ADA': new Decimal(5), 'ADA/BADGER': new Decimal(1).div(5),
        'ALPHA/TRX': new Decimal(5), 'TRX/ALPHA': new Decimal(1).div(5),
        'BTT/BTC': new Decimal(0.0000000002), 'BTC/BTT': new Decimal(1).div(0.0000000002),
        'EFI/ETH': new Decimal(0.00001), 'ETH/EFI': new Decimal(1).div(0.00001),
        'XVS/USDT': new Decimal(6.5), 'USDT/XVS': new Decimal(1).div(6.5),
        'COTI/XRP': new Decimal(3), 'XRP/COTI': new Decimal(1).div(3),
        'FIDA/SOL': new Decimal(0.0002), 'SOL/FIDA': new Decimal(1).div(0.0002),
        'CELO/BNB': new Decimal(0.006), 'BNB/CELO': new Decimal(1).div(0.006),
        'GLMR/USDC': new Decimal(0.35), 'USDC/GLMR': new Decimal(1).div(0.35),
        'SUPER/DOGE': new Decimal(1), 'DOGE/SUPER': new Decimal(1).div(1),
        'TRAC/ADA': new Decimal(0.8), 'ADA/TRAC': new Decimal(1).div(0.8),
        'ERG/BTC': new Decimal(0.00005), 'BTC/ERG': new Decimal(1).div(0.00005),
        'XDC/ETH': new Decimal(0.000005), 'ETH/XDC': new Decimal(1).div(0.000005),
        'TWT/USDT': new Decimal(1.5), 'USDT/TWT': new Decimal(1).div(1.5),
        'RSR/XRP': new Decimal(0.005), 'XRP/RSR': new Decimal(1).div(0.005),
        'SPELL/BNB': new Decimal(0.00000002), 'BNB/SPELL': new Decimal(1).div(0.00000002),
        'METIS/SOL': new Decimal(0.004), 'SOL/METIS': new Decimal(1).div(0.004),
        'CVP/USDC': new Decimal(0.5), 'USDC/CVP': new Decimal(1).div(0.5),
        'ONT/DOGE': new Decimal(8), 'DOGE/ONT': new Decimal(1).div(8),
        'ARKM/ADA': new Decimal(0.8), 'ADA/ARKM': new Decimal(1).div(0.8),
        'WOO/TRX': new Decimal(1.2), 'TRX/WOO': new Decimal(1).div(1.2),
        'BAND/BTC': new Decimal(0.00008), 'BTC/BAND': new Decimal(1).div(0.00008),
        '1INCH/ETH': new Decimal(0.0004), 'ETH/1INCH': new Decimal(1).div(0.0004),
        'GMX/USDT': new Decimal(45), 'USDT/GMX': new Decimal(1).div(45),
        'CKB/XRP': new Decimal(0.003), 'XRP/CKB': new Decimal(1).div(0.003),
        'XRD/BNB': new Decimal(0.00005), 'BNB/XRD': new Decimal(1).div(0.00005),
        'ENJ/SOL': new Decimal(0.00002), 'SOL/ENJ': new Decimal(1).div(0.00002),
        'NEO/USDC': new Decimal(12), 'USDC/NEO': new Decimal(1).div(12),
        'BLUR/DOGE': new Decimal(10), 'DOGE/BLUR': new Decimal(1).div(10),
        'OCEAN/ADA': new Decimal(0.5), 'ADA/OCEAN': new Decimal(1).div(0.5),
        'ZEC/TRX': new Decimal(100), 'TRX/ZEC': new Decimal(1).div(100),
        'ROSE/BTC': new Decimal(0.000005), 'BTC/ROSE': new Decimal(1).div(0.000005),
        'IOTA/ETH': new Decimal(0.00008), 'ETH/IOTA': new Decimal(1).div(0.00008),
        'WLD/USDT': new Decimal(5), 'USDT/WLD': new Decimal(1).div(5),
        'KAVA/XRP': new Decimal(1.8), 'XRP/KAVA': new Decimal(1).div(1.8),
        'HNT/BNB': new Decimal(0.005), 'BNB/HNT': new Decimal(1).div(0.005),
        'MINA/SOL': new Decimal(0.0001), 'SOL/MINA': new Decimal(1).div(0.0001),
        'DYDX/USDC': new Decimal(2.5), 'USDC/DYDX': new Decimal(1).div(2.5),
        'GALA/DOGE': new Decimal(0.8), 'DOGE/GALA': new Decimal(1).div(0.8),
        'CAKE/TRX': new Decimal(15), 'TRX/CAKE': new Decimal(1).div(15),
        'RPL/BTC': new Decimal(0.003), 'BTC/RPL': new Decimal(1).div(0.003),
    'MANA/ETH': new Decimal(0.0002), 'ETH/MANA': new Decimal(1).div(0.0002)
  };
  const directRate = rates[`${fromCurrency}/${toCurrency}`];
  if (directRate) {
    return directRate;
  }
  const inverseRate = rates[`${toCurrency}/${fromCurrency}`];
  if (inverseRate) {
    return new Decimal(1).div(inverseRate);
  }
  const stableCoins = ['USD', 'USDT', 'USDC'];
  for (const stable of stableCoins) {
    const fromStableRate = rates[`${fromCurrency}/${stable}`];
    const toStableRate = rates[`${toCurrency}/${stable}`];
    if (fromStableRate && toStableRate) {
      logger.info(`Simulating ${fromCurrency}/${toCurrency} via ${stable}`);
      return fromStableRate.times(new Decimal(1).div(toStableRate));
    }
  }
  logger.warn(`No specific or inferred simulated rate found for ${fromCurrency}/${toCurrency}. Returning a default of 1.0.`);
  return new Decimal(1.0);
}

// 5. Exported controller functions
export const swap = async (req, res) => {
  const session = await Wallet.startSession();
  session.startTransaction();
  try {
    const { fromCurrency, toCurrency, amount } = req.body;
    const userId = req.user._id;
    if (!fromCurrency || !toCurrency || !amount) {
      throw new Error('Missing required swap parameters (fromCurrency, toCurrency, amount).');
    }
    // Ensure input currencies are consistently uppercase for comparison and lookup
    const fromCurrencyUpper = fromCurrency.toUpperCase();
    const toCurrencyUpper = toCurrency.toUpperCase();
    if (fromCurrencyUpper === toCurrencyUpper) {
      throw new Error('Cannot swap between the same currency.');
    }
    const numericAmount = new Decimal(amount);
    if (numericAmount.lessThanOrEqualTo(0)) {
      throw new Error('Amount must be positive.');
    }
    await validateCurrency(fromCurrencyUpper); // Pass uppercase symbol
    await validateCurrency(toCurrencyUpper);   // Pass uppercase symbol
    const isPairAvailable = AVAILABLE_TRADING_PAIRS.some(
      pair => (pair.base === fromCurrencyUpper && pair.quote === toCurrencyUpper) ||
              (pair.base === toCurrencyUpper && pair.quote === fromCurrencyUpper)
    );
    if (!isPairAvailable) {
      throw new Error(`Trading pair ${fromCurrencyUpper}/${toCurrencyUpper} is not available.`);
    }
    const wallet = await Wallet.findOne({ userId }).session(session);
    if (!wallet) {
      throw new Error('Wallet not found for this user.');
    }
    const fromBalance = new Decimal(wallet.balances.get(fromCurrencyUpper) || 0);
    if (fromBalance.lessThan(numericAmount)) {
      throw new Error(`Insufficient ${fromCurrencyUpper} balance. Available: ${fromBalance.toFixed(8)}`);
    }
    const exchangeRate = await getSimulatedExchangeRate(fromCurrencyUpper, toCurrencyUpper);
    const receivedAmount = numericAmount.times(exchangeRate);
    await wallet.updateBalance(fromCurrencyUpper, numericAmount.negated(), 'decrement', session);
    await wallet.updateBalance(toCurrencyUpper, receivedAmount, 'increment', session);
    await Transaction.create({
      userId,
      walletId: wallet._id,
      type: 'swap',
      fromCurrency: fromCurrencyUpper,
      toCurrency: toCurrencyUpper,
      amount: numericAmount.toNumber(),
      receivedAmount: receivedAmount.toNumber(),
      rate: exchangeRate.toNumber(),
      status: 'COMPLETED',
      timestamp: new Date()
    }, { session });
    await session.commitTransaction();
    res.json(formatResponse(true, 'Swap successful', { receivedAmount: receivedAmount.toNumber() }));
  } catch (error) {
    await session.abortTransaction();
    logger.error(`Swap error for user ${req.user?._id}: ${error.message}`, error);
    res.status(400).json(formatResponse(false, error.message || 'An unexpected error occurred during the swap.'));
  } finally {
    session.endSession();
  }
};

export const buyCurrency = async (req, res) => {
  const session = await Wallet.startSession();
  session.startTransaction();
  try {
    const { baseCurrency, quoteCurrency, amount } = req.body;
    const userId = req.user._id;

    const numericAmount = new Decimal(amount);
    const baseCurrencyUpper = baseCurrency.toUpperCase();
    const quoteCurrencyUpper = quoteCurrency.toUpperCase();

    if (!baseCurrency || !quoteCurrency || !amount) {
      throw new Error('Missing required buy parameters (baseCurrency, quoteCurrency, amount).');
    }
    if (numericAmount.lessThanOrEqualTo(0)) {
      throw new Error('Amount must be positive.');
    }

    const isPairAvailable = AVAILABLE_TRADING_PAIRS.some(
      pair => pair.base === baseCurrencyUpper && pair.quote === quoteCurrencyUpper
    );
    if (!isPairAvailable) {
      throw new Error(`Trading pair ${baseCurrencyUpper}/${quoteCurrencyUpper} is not available.`);
    }

    const wallet = await Wallet.findOne({ userId }).session(session);
    if (!wallet) {
      throw new Error('Wallet not found');
    }

    const quoteBalance = new Decimal(wallet.balances.get(quoteCurrencyUpper) || 0);

    const { ask: currentAskPrice } = await getSimulatedBidAskPrices(baseCurrencyUpper, quoteCurrencyUpper);
    const baseAmountToBuy = numericAmount.dividedBy(currentAskPrice);

    if (quoteBalance.lessThan(numericAmount)) {
      throw new Error(`Insufficient ${quoteCurrencyUpper} balance. Available: ${quoteBalance.toFixed(8)}`);
    }

    await wallet.updateBalance(quoteCurrencyUpper, numericAmount.negated(), 'decrement', session);
    await wallet.updateBalance(baseCurrencyUpper, baseAmountToBuy, 'increment', session);

    await Transaction.create({
      userId,
      walletId: wallet._id,
      type: 'buy',
      fromCurrency: quoteCurrencyUpper,
      toCurrency: baseCurrencyUpper,
      amount: numericAmount.toNumber(),
      receivedAmount: baseAmountToBuy.toNumber(),
      rate: currentAskPrice.toNumber(),
      status: 'COMPLETED',
      timestamp: new Date()
    }, { session });

    await session.commitTransaction();
    res.json(formatResponse(true, `Successfully bought ${baseAmountToBuy.toFixed(8)} ${baseCurrencyUpper}`, { receivedAmount: baseAmountToBuy.toNumber() }));
  } catch (error) {
    await session.abortTransaction();
    logger.error(`Buy error: ${error.message}`, error);
    res.status(400).json(formatResponse(false, error.message || 'An unexpected error occurred during the buy operation.'));
  } finally {
    session.endSession();
  }
};

export const sellCurrency = async (req, res) => {
  const session = await Wallet.startSession();
  session.startTransaction();
  try {
    const { baseCurrency, quoteCurrency, amount } = req.body;
    const userId = req.user._id;

    const numericAmount = new Decimal(amount);
    const baseCurrencyUpper = baseCurrency.toUpperCase();
    const quoteCurrencyUpper = quoteCurrency.toUpperCase();

    if (!baseCurrency || !quoteCurrency || !amount) {
      throw new Error('Missing required sell parameters (baseCurrency, quoteCurrency, amount).');
    }
    if (numericAmount.lessThanOrEqualTo(0)) {
      throw new Error('Amount must be positive.');
    }

    const isPairAvailable = AVAILABLE_TRADING_PAIRS.some(
      pair => pair.base === baseCurrencyUpper && pair.quote === quoteCurrencyUpper
    );
    if (!isPairAvailable) {
      throw new Error(`Trading pair ${baseCurrencyUpper}/${quoteCurrencyUpper} is not available.`);
    }

    const wallet = await Wallet.findOne({ userId }).session(session);
    if (!wallet) {
      throw new Error('Wallet not found');
    }

    const baseBalance = new Decimal(wallet.balances.get(baseCurrencyUpper) || 0);

    const { bid: currentBidPrice } = await getSimulatedBidAskPrices(baseCurrencyUpper, quoteCurrencyUpper);
    const quoteAmountToReceive = numericAmount.multipliedBy(currentBidPrice);

    if (baseBalance.lessThan(numericAmount)) {
      throw new Error(`Insufficient ${baseCurrencyUpper} balance. Available: ${baseBalance.toFixed(8)}`);
    }

    await wallet.updateBalance(baseCurrencyUpper, numericAmount.negated(), 'decrement', session);
    await wallet.updateBalance(quoteCurrencyUpper, quoteAmountToReceive, 'increment', session);

    await Transaction.create({
      userId,
      walletId: wallet._id,
      type: 'sell',
      fromCurrency: baseCurrencyUpper,
      toCurrency: quoteCurrencyUpper,
      amount: numericAmount.toNumber(),
      receivedAmount: quoteAmountToReceive.toNumber(),
      rate: currentBidPrice.toNumber(),
      status: 'COMPLETED',
      timestamp: new Date()
    }, { session });

    await session.commitTransaction();
    res.json(formatResponse(true, `Successfully sold ${numericAmount.toFixed(8)} ${baseCurrencyUpper}`, { receivedAmount: quoteAmountToReceive.toNumber() }));
  } catch (error) {
    await session.abortTransaction();
    logger.error(`Sell error: ${error.message}`, error);
    res.status(400).json(formatResponse(false, error.message || 'An unexpected error occurred during the sell operation.'));
  } finally {
    session.endSession();
  }
};

// In-memory order books (for simulation purposes)
const orderBooks = {};
const getOrderBook = (pair) => {
  if (!orderBooks[pair]) {
    orderBooks[pair] = {
      buyOrders: [],
      sellOrders: [],
    };
  }
  return orderBooks[pair];
};

const sortBuyOrders = (a, b) => new Decimal(b.price).minus(a.price).toNumber();

const sortSellOrders = (a, b) => new Decimal(a.price).minus(b.price).toNumber();

export const getExchangePairs = async (req, res) => {
  try {
    res.json(formatResponse(true, 'Available trading pairs retrieved successfully', AVAILABLE_TRADING_PAIRS));
  } catch (error) {
    logger.error(`Error fetching exchange pairs: ${error.message}`, error);
    res.status(500).json(formatResponse(false, 'Server error while fetching exchange pairs'));
  }
};

export const placeOrder = async (req, res) => {
  const session = await Wallet.startSession();
  session.startTransaction();
  try {
    const { pair, type, amount, price } = req.body;
    const userId = req.user._id;
    if (!pair || !type || !amount || !price) {
      throw new Error('Missing required order parameters');
    }
    const pairUpper = pair.toUpperCase(); // Ensure pair is uppercase
    if (!AVAILABLE_TRADING_PAIRS.some(p => p.symbol === pairUpper)) {
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
    const [baseCurrency, quoteCurrency] = pairUpper.split('/'); // Use pairUpper
    // Check for sufficient balance and reserve funds
    if (type.toUpperCase() === 'BUY') {
      const cost = numericAmount.mul(numericPrice);
      const quoteBalance = new Decimal(wallet.balances.get(quoteCurrency) || 0); // Use .get()
      if (quoteBalance.lessThan(cost)) {
        throw new Error(`Insufficient ${quoteCurrency} balance for buy order`);
      }
      // For a real exchange, you'd move funds to an "escrow" or "locked" state here
      // For this simulation, we'll assume the wallet.updateBalance in executeTrade handles it
    } else if (type.toUpperCase() === 'SELL') {
      const baseBalance = new Decimal(wallet.balances.get(baseCurrency) || 0); // Use .get()
      if (baseBalance.lessThan(numericAmount)) {
        throw new Error(`Insufficient ${baseCurrency} balance for sell order`);
      }
      // For a real exchange, you'd move funds to an "escrow" or "locked" state here
    } else {
      throw new Error('Invalid order type');
    }
    const orderBook = getOrderBook(pairUpper); // Use pairUpper
    const order = { userId, price: numericPrice.toNumber(), amount: numericAmount.toNumber(), type: type.toUpperCase(), baseCurrency, quoteCurrency }; // Add type and currencies to order for easier lookup
    if (type.toUpperCase() === 'BUY') {
      orderBook.buyOrders.push(order);
      orderBook.buyOrders.sort(sortBuyOrders);
    } else if (type.toUpperCase() === 'SELL') {
      orderBook.sellOrders.push(order);
      orderBook.sellOrders.sort(sortSellOrders);
    }
    // Basic matching logic (immediate execution if possible)
    // Pass original pair to matchOrders to get correct order book
    await matchOrders(pairUpper, session);
    await session.commitTransaction();
    res.json(formatResponse(true, `Order placed successfully (${type} ${amount} at ${price} ${pair})`));
  } catch (error) {
    await session.abortTransaction();
    logger.error(`Error placing order: ${error.message}`, error);
    res.status(400).json(formatResponse(false, error.message || 'An unexpected error occurred during order placement.'));
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
  const numericAmount = new Decimal(amount);
  const numericPrice = new Decimal(price);
  const cost = numericAmount.mul(numericPrice); // Amount of quote currency buyer pays
  const receivedQuote = numericAmount.mul(numericPrice); // Amount of quote currency seller receives
  const buyerWallet = await Wallet.findOne({ userId: buyerId }).session(session);
  const sellerWallet = await Wallet.findOne({ userId: sellerId }).session(session);
  if (!buyerWallet || !sellerWallet) {
    logger.error(`Error: Could not find buyer or seller wallet during trade execution. Buyer: ${buyerId}, Seller: ${sellerId}`);
    // Potentially throw an error here to abort transaction
    throw new Error('Wallets not found for trade execution.');
  }
  // Buyer: Decrement quote, increment base
  await buyerWallet.updateBalance(quoteCurrency, cost.negated(), 'decrement', session);
  await buyerWallet.updateBalance(baseCurrency, numericAmount, 'increment', session);
  // Seller: Decrement base, increment quote
  await sellerWallet.updateBalance(baseCurrency, numericAmount.negated(), 'decrement', session);
  await sellerWallet.updateBalance(quoteCurrency, receivedQuote, 'increment', session);
  // Record buyer's trade transaction
  await Transaction.create({
    userId: buyerId,
    walletId: buyerWallet._id,
    type: 'trade',
    baseCurrency: baseCurrency,
    quoteCurrency: quoteCurrency,
    amount: numericAmount.toNumber(), // Amount of base currency bought
    price: numericPrice.toNumber(),
    totalCost: cost.toNumber(), // Total quote currency spent by buyer
    status: 'COMPLETED',
    timestamp: new Date(),
    counterParty: sellerId,
    tradeType: 'BUY'
  }, { session });
  // Record seller's trade transaction
  await Transaction.create({
    userId: sellerId,
    walletId: sellerWallet._id,
    type: 'trade',
    baseCurrency: baseCurrency,
    quoteCurrency: quoteCurrency,
    amount: numericAmount.toNumber(), // Amount of base currency sold
    price: numericPrice.toNumber(),
    receivedAmount: receivedQuote.toNumber(), // Total quote currency received by seller
    status: 'COMPLETED',
    timestamp: new Date(),
    counterParty: buyerId,
    tradeType: 'SELL'
  }, { session });
}

export const getMarketData = async (req, res) => {
  try {
    const { pair } = req.query;
    const pairUpper = pair.toUpperCase();

    if (!pairUpper || !AVAILABLE_TRADING_PAIRS.some(p => p.symbol === pairUpper)) {
      return res.status(400).json(formatResponse(false, 'Invalid trading pair'));
    }

    const orderBook = getOrderBook(pairUpper);
    let lastPrice = 0;
    let midPrice = 0;

    const bestBid = orderBook.buyOrders.length > 0 ? new Decimal(orderBook.buyOrders[0].price) : null;
    const bestAsk = orderBook.sellOrders.length > 0 ? new Decimal(orderBook.sellOrders[0].price) : null;

    if (bestBid && bestAsk) {
      midPrice = bestBid.plus(bestAsk).dividedBy(2).toNumber();
      lastPrice = midPrice;
    } else {
      const [baseC, quoteC] = pairUpper.split('/');
      const { mid } = await getSimulatedBidAskPrices(baseC, quoteC);
      lastPrice = mid.toNumber();
      midPrice = mid.toNumber();
    }

    res.json(formatResponse(true, `Market data for ${pairUpper}`, {
      buyOrders: orderBook.buyOrders.slice(0, 10),
      sellOrders: orderBook.sellOrders.slice(0, 10),
      lastPrice,
      midPrice,
    }));
  } catch (error) {
    logger.error(`Error fetching market data for ${req.query.pair}: ${error.message}`, error);
    res.status(500).json(formatResponse(false, 'Server error fetching market data'));
  }
};
