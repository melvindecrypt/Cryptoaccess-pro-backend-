import { Decimal } from 'decimal.js';
import { logger } from './logger'; // Assuming your logger utility path

// --- IMPORTANT: This is an in-memory store. For production, these settings
// --- should be loaded from and saved to a database (e.g., your Settings model).
export let adminSpreadSettings = {
  'BTC/USDT': { minSpreadPct: 0.0005, maxSpreadPct: 0.0015 }, // 0.05% to 0.15% spread
  'ETH/USDT': { minSpreadPct: 0.0008, maxSpreadPct: 0.0020 },
  'BNB/USDT': { minSpreadPct: 0.0010, maxSpreadPct: 0.0025 },
  'SOL/BTC': { minSpreadPct: 0.0012, maxSpreadPct: 0.0028 },
  'DOGE/USDT': { minSpreadPct: 0.0015, maxSpreadPct: 0.0035 },
  'ADA/USDT': { minSpreadPct: 0.0009, maxSpreadPct: 0.0022 },
  'TRX/USDT': { minSpreadPct: 0.0011, maxSpreadPct: 0.0027 },
  'XRP/BTC': { minSpreadPct: 0.0013, maxSpreadPct: 0.0030 },
  'SHIB/USDT': { minSpreadPct: 0.0020, maxSpreadPct: 0.0050 },
  'LTC/USDT': { minSpreadPct: 0.0007, maxSpreadPct: 0.0018 },
  'AVAX/USDT': { minSpreadPct: 0.0010, maxSpreadPct: 0.0025 },
  'MATIC/USDT': { minSpreadPct: 0.0009, maxSpreadPct: 0.0023 },
  'DOT/BTC': { minSpreadPct: 0.00012, maxSpreadPct: 0.0026 },
  'TON/USDT': { minSpreadPct: 0.0006, maxSpreadPct: 0.0017 },
  'NEAR/USDT': { minSpreadPct: 0.0008, maxSpreadPct: 0.0019 },
  'LINK/ETH': { minSpreadPct: 0.0010, maxSpreadPct: 0.0024 },
  'OP/USDT': { minSpreadPct: 0.0007, maxSpreadPct: 0.0018 },
  'ARB/USDT': { minSpreadPct: 0.0006, maxSpreadPct: 0.0017 },
  'MNT/BTC': { minSpreadPct: 0.0014, maxSpreadPct: 0.0032 },
  'DAI/USDT': { minSpreadPct: 0.0001, maxSpreadPct: 0.0003 }, // Stablecoin, tighter spread
  'DEFAULT': { minSpreadPct: 0.0010, maxSpreadPct: 0.0030 } // Default for any pair not explicitly listed
};

// Comprehensive list of trading pairs for filtering and validation.
// This should match the list you use on your frontend.
export const AVAILABLE_TRADING_PAIRS = [
  { symbol: 'BTC/USDT', base: 'BTC', quote: 'USDT' },
  { symbol: 'ETH/BTC', base: 'ETH', quote: 'BTC' },
  { symbol: 'BNB/USDT', base: 'BNB', quote: 'USDT' },
  { symbol: 'SOL/BTC', base: 'SOL', quote: 'BTC' },
  { symbol: 'DOGE/USDT', base: 'DOGE', quote: 'USDT' },
  { symbol: 'ADA/USDT', base: 'ADA', quote: 'USDT' },
  { symbol: 'TRX/USDT', base: 'TRX', quote: 'USDT' },
  { symbol: 'XRP/BTC', base: 'XRP', quote: 'BTC' },
  { symbol: 'SHIB/USDT', base: 'SHIB', quote: 'USDT' },
  { symbol: 'LTC/USDT', base: 'LTC', quote: 'USDT' },
  { symbol: 'AVAX/USDT', base: 'AVAX', quote: 'USDT' },
  { symbol: 'MATIC/USDT', base: 'MATIC', quote: 'USDT' },
  { symbol: 'DOT/BTC', base: 'DOT', quote: 'BTC' },
  { symbol: 'TON/USDT', base: 'TON', quote: 'USDT' },
  { symbol: 'NEAR/USDT', base: 'NEAR', quote: 'USDT' },
  { symbol: 'LINK/ETH', base: 'LINK', quote: 'ETH' },
  { symbol: 'OP/USDT', base: 'OP', quote: 'USDT' },
  { symbol: 'ARB/USDT', base: 'ARB', quote: 'USDT' },
  { symbol: 'MNT/BTC', base: 'MNT', quote: 'BTC' },
  { symbol: 'DAI/USDT', base: 'DAI', quote: 'USDT' },
  // Add more pairs here to reach at least 50 if your list is shorter
  // Example for adding more:
  { symbol: 'UNI/USDT', base: 'UNI', quote: 'USDT' },
  { symbol: 'ATOM/USDT', base: 'ATOM', quote: 'USDT' },
  { symbol: 'ICP/USDT', base: 'ICP', quote: 'USDT' },
  { symbol: 'VET/USDT', base: 'VET', quote: 'USDT' },
  { symbol: 'FIL/USDT', base: 'FIL', quote: 'USDT' },
  { symbol: 'ETC/USDT', base: 'ETC', quote: 'USDT' },
  { symbol: 'HBAR/USDT', base: 'HBAR', quote: 'USDT' },
  { symbol: 'XLM/USDT', base: 'XLM', quote: 'USDT' },
  { symbol: 'ALGO/USDT', base: 'ALGO', quote: 'USDT' },
  { symbol: 'EGLD/USDT', base: 'EGLD', quote: 'USDT' },
  { symbol: 'FLOW/USDT', base: 'FLOW', quote: 'USDT' },
  { symbol: 'THETA/USDT', base: 'THETA', quote: 'USDT' },
  { symbol: 'APE/USDT', base: 'APE', quote: 'USDT' },
  { symbol: 'AXS/USDT', base: 'AXS', quote: 'USDT' },
  { symbol: 'SAND/USDT', base: 'SAND', quote: 'USDT' },
  { symbol: 'MANA/USDT', base: 'MANA', quote: 'USDT' },
  { symbol: 'ENJ/USDT', base: 'ENJ', quote: 'USDT' },
  { symbol: 'CHZ/USDT', base: 'CHZ', quote: 'USDT' },
  { symbol: 'GRT/USDT', base: 'GRT', quote: 'USDT' },
  { symbol: 'AAVE/USDT', base: 'AAVE', quote: 'USDT' },
  { symbol: 'COMP/USDT', base: 'COMP', quote: 'USDT' },
  { symbol: 'MKR/USDT', base: 'MKR', quote: 'USDT' },
  { symbol: 'SUSHI/USDT', base: 'SUSHI', quote: 'USDT' },
  { symbol: 'UNI/ETH', base: 'UNI', quote: 'ETH' },
  { symbol: 'DOT/USDT', base: 'DOT', quote: 'USDT' },
  { symbol: 'ARB/ETH', base: 'ARB', quote: 'ETH' },
  { symbol: 'OP/ETH', base: 'OP', quote: 'ETH' },
  { symbol: 'NEAR/BTC', base: 'NEAR', quote: 'BTC' },
  { symbol: 'TON/BTC', base: 'TON', quote: 'BTC' },
  { symbol: 'LTC/BTC', base: 'LTC', quote: 'BTC' }
];

// --- Mock CoinGecko Price Fetching ---
// IMPORTANT: Replace this with your actual CoinGecko API integration.
// For production, you'd make actual HTTP requests, handle caching, and
// potentially implement a more robust mapping from your internal symbols to CoinGecko IDs.
async function getBasePriceFromCoinGecko(baseSymbol, quoteSymbol) {
  // This is a simplified mock. In reality, you'd fetch from CoinGecko.
  // Example: axios.get(`https://api.coingecko.com/api/v3/simple/price?ids=${coinId}&vs_currencies=${vsCurrency}`);
  // You'd need a mapping: BTC -> bitcoin, USDT -> usd etc.

  const mockPrices = {
    'BTC/USDT': 67500.00,
    'ETH/USDT': 3500.00,
    'BNB/USDT': 600.00,
    'SOL/BTC': 0.0028,
    'DOGE/USDT': 0.12,
    'ADA/USDT': 0.45,
    'TRX/USDT': 0.10,
    'XRP/BTC': 0.0000075,
    'SHIB/USDT': 0.000025,
    'LTC/USDT': 80.00,
    'AVAX/USDT': 30.00,
    'MATIC/USDT': 0.75,
    'DOT/BTC': 0.00012,
    'TON/USDT': 7.00,
    'NEAR/USDT': 6.00,
    'LINK/ETH': 0.004,
    'OP/USDT': 2.50,
    'ARB/USDT': 1.00,
    'MNT/BTC': 0.00003,
    'DAI/USDT': 1.00,
    // Add more mock prices for all your 50+ pairs
    'UNI/USDT': 10.00,
    'ATOM/USDT': 8.00,
    'ICP/USDT': 5.00,
    'VET/USDT': 0.025,
    'FIL/USDT': 5.00,
    'ETC/USDT': 25.00,
    'HBAR/USDT': 0.08,
    'XLM/USDT': 0.10,
    'ALGO/USDT': 0.15,
    'EGLD/USDT': 40.00,
    'FLOW/USDT': 0.70,
    'THETA/USDT': 1.50,
    'APE/USDT': 1.20,
    'AXS/USDT': 5.00,
    'SAND/USDT': 0.40,
    'MANA/USDT': 0.35,
    'ENJ/USDT': 0.28,
    'CHZ/USDT': 0.08,
    'GRT/USDT': 0.20,
    'AAVE/USDT': 90.00,
    'COMP/USDT': 60.00,
    'MKR/USDT': 2500.00,
    'SUSHI/USDT': 1.20,
    // Inverse pairs for cross-currency calculations
    'USDT/BTC': new Decimal(1).dividedBy(67500.00).toNumber(),
    'BTC/ETH': new Decimal(1).dividedBy(new Decimal(3500).dividedBy(67500)).toNumber(), // Price of 1 BTC in ETH
    // ... calculate other inverse mock prices if needed
  };

  const pairSymbol = `${baseSymbol}/${quoteSymbol}`;
  const inversePairSymbol = `${quoteSymbol}/${baseSymbol}`; // Corrected inverse pair symbol logic

  let price = mockPrices[pairSymbol];

  if (!price) {
    // If direct pair not found, try inverse and calculate
    const inversePrice = mockPrices[inversePairSymbol];
    if (inversePrice) {
      price = new Decimal(1).dividedBy(inversePrice).toNumber();
    }
  }

  if (!price) {
    logger.warn(`No mock price found for ${pairSymbol}. Returning a placeholder.`);
    // Fallback: This should ideally throw an error or use a more robust fallback mechanism.
    return new Decimal(1);
  }

  return new Decimal(price);
}

// Function to generate simulated bid/ask prices with an admin-controlled spread
export async function getSimulatedBidAskPrices(baseCurrency, quoteCurrency) {
  const pairSymbol = `${baseCurrency}/${quoteCurrency}`;
  const basePrice = await getBasePriceFromCoinGecko(baseCurrency, quoteCurrency); // This is your 'mid-price' reference

  // Get spread configuration for the pair, falling back to 'DEFAULT'
  const config = adminSpreadSettings[pairSymbol] || adminSpreadSettings['DEFAULT'];
  const minSpread = new Decimal(config.minSpreadPct);
  const maxSpread = new Decimal(config.maxSpreadPct);

  // Simulate a dynamic spread within the configured range
  // This can be made more sophisticated (e.g., normal distribution, volume-based)
  const randomFactor = new Decimal(Math.random()); // 0 to 1
  const currentSpreadPct = minSpread.plus(maxSpread.minus(minSpread).times(randomFactor));

  // Calculate bid and ask prices
  const halfSpread = basePrice.times(currentSpreadPct).dividedBy(2);
  const askPrice = basePrice.plus(halfSpread); // Price you buy at (higher)
  const bidPrice = basePrice.minus(halfSpread); // Price you sell at (lower)

  logger.debug(`Simulated Bid/Ask for ${pairSymbol}: Bid=${bidPrice.toFixed(8)}, Ask=${askPrice.toFixed(8)}, Mid=${basePrice.toFixed(8)}, SpreadPct=${currentSpreadPct.times(100).toFixed(4)}%`);

  return { bid: bidPrice, ask: askPrice, mid: basePrice };
}

// Function to update admin spread settings (used by admin API route)
// In a production app, this would write to a database.
export function updateAdminSpreadSettings(settingsUpdate) {
  if (settingsUpdate.isDefault) {
    adminSpreadSettings['DEFAULT'] = {
      minSpreadPct: settingsUpdate.minSpreadPct,
      maxSpreadPct: settingsUpdate.maxSpreadPct
    };
    logger.info('Default spread settings updated.');
  } else if (settingsUpdate.pair) {
    const pairUpper = settingsUpdate.pair.toUpperCase();
    if (!AVAILABLE_TRADING_PAIRS.some(p => p.symbol === pairUpper)) {
      logger.warn(`Attempted to update spread for invalid pair: ${pairUpper}`);
      throw new Error(`Invalid trading pair: ${pairUpper}`);
    }
    adminSpreadSettings[pairUpper] = {
      minSpreadPct: settingsUpdate.minSpreadPct,
      maxSpreadPct: settingsUpdate.maxSpreadPct
    };
    logger.info(`Spread settings for ${pairUpper} updated.`);
  }
  // console.log('Current adminSpreadSettings after update:', adminSpreadSettings); // For debugging
}

import { Decimal } from 'decimal.js';
import { logger } from './logger'; // Assuming your logger utility path
import axios from 'axios'; // <--- NEW: Import axios

// --- CoinGecko API Configuration ---
const COINGECKO_API_BASE_URL = 'https://api.coingecko.com/api/v3';
// Get API key from environment variables
const COINGECKO_API_KEY = process.env.COINGECKO_API_KEY || ''; // Use your actual API key, or leave empty for free tier (limited)

// In-memory cache for live prices to prevent hitting API rate limits
const priceCache = {};
const CACHE_TTL = 15 * 1000; // 15 seconds (adjust based on CoinGecko rate limits and desired freshness)

// Mapping from your internal currency symbols to CoinGecko API IDs
// IMPORTANT: Extend this mapping for ALL your 50+ base and quote currencies
const COINGECKO_SYMBOL_MAPPING = {
  'BTC': 'bitcoin',
  'ETH': 'ethereum',
  'USDT': 'tether',
  'BNB': 'binancecoin', // CoinGecko ID for BNB
  'SOL': 'solana',
  'DOGE': 'dogecoin',
  'ADA': 'cardano',
  'TRX': 'tron',
  'XRP': 'ripple',
  'SHIB': 'shiba-inu',
  'LTC': 'litecoin',
  'AVAX': 'avalanche-2',
  'MATIC': 'polygon',
  'DOT': 'polkadot',
  'TON': 'toncoin',
  'NEAR': 'near',
  'LINK': 'chainlink',
  'OP': 'optimism',
  'ARB': 'arbitrum',
  'MNT': 'mantle',
  'DAI': 'dai',
  // Extend for all your currencies:
  'UNI': 'uniswap',
  'ATOM': 'cosmos',
  'ICP': 'internet-computer',
  'VET': 'vechain',
  'FIL': 'filecoin',
  'ETC': 'ethereum-classic',
  'HBAR': 'hedera-hashgraph',
  'XLM': 'stellar',
  'ALGO': 'algorand',
  'EGLD': 'elrond',
  'FLOW': 'flow',
  'THETA': 'theta-token',
  'APE': 'apecoin',
  'AXS': 'axie-infinity',
  'SAND': 'the-sandbox',
  'MANA': 'decentraland',
  'ENJ': 'enjincoin',
  'CHZ': 'chiliz',
  'GRT': 'the-graph',
  'AAVE': 'aave',
  'COMP': 'compound-governance-token',
  'MKR': 'maker',
  'SUSHI': 'sushi',
  // ... continue adding for all 50+ currencies you support
};


// --- Your existing adminSpreadSettings and AVAILABLE_TRADING_PAIRS (from previous response) ---
export let adminSpreadSettings = {
    'BTC/USDT': { minSpreadPct: 0.0005, maxSpreadPct: 0.0015 },
    'ETH/USDT': { minSpreadPct: 0.0008, maxSpreadPct: 0.0020 },
    'BNB/USDT': { minSpreadPct: 0.0010, maxSpreadPct: 0.0025 },
    'SOL/BTC': { minSpreadPct: 0.0012, maxSpreadPct: 0.0028 },
    'DOGE/USDT': { minSpreadPct: 0.0015, maxSpreadPct: 0.0035 },
    'ADA/USDT': { minSpreadPct: 0.0009, maxSpreadPct: 0.0022 },
    'TRX/USDT': { minSpreadPct: 0.0011, maxSpreadPct: 0.0027 },
    'XRP/BTC': { minSpreadPct: 0.0013, maxSpreadPct: 0.0030 },
    'SHIB/USDT': { minSpreadPct: 0.0020, maxSpreadPct: 0.0050 },
    'LTC/USDT': { minSpreadPct: 0.0007, maxSpreadPct: 0.0018 },
    'AVAX/USDT': { minSpreadPct: 0.0010, maxSpreadPct: 0.0025 },
    'MATIC/USDT': { minSpreadPct: 0.0009, maxSpreadPct: 0.0023 },
    'DOT/BTC': { minSpreadPct: 0.0011, maxSpreadPct: 0.0026 },
    'TON/USDT': { minSpreadPct: 0.0006, maxSpreadPct: 0.0017 },
    'NEAR/USDT': { minSpreadPct: 0.0008, maxSpreadPct: 0.0019 },
    'LINK/ETH': { minSpreadPct: 0.0010, maxSpreadPct: 0.0024 },
    'OP/USDT': { minSpreadPct: 0.0007, maxSpreadPct: 0.0018 },
    'ARB/USDT': { minSpreadPct: 0.0006, maxSpreadPct: 0.0017 },
    'MNT/BTC': { minSpreadPct: 0.0014, maxSpreadPct: 0.0032 },
    'DAI/USDT': { minSpreadPct: 0.0001, maxSpreadPct: 0.0003 }, // Stablecoin, tighter spread
    'DEFAULT': { minSpreadPct: 0.0010, maxSpreadPct: 0.0030 }
};

export const AVAILABLE_TRADING_PAIRS = [
    { symbol: 'BTC/USDT', base: 'BTC', quote: 'USDT' },
    { symbol: 'ETH/BTC', base: 'ETH', quote: 'BTC' },
    { symbol: 'BNB/USDT', base: 'BNB', quote: 'USDT' },
    { symbol: 'SOL/BTC', base: 'SOL', quote: 'BTC' },
    { symbol: 'DOGE/USDT', base: 'DOGE', quote: 'USDT' },
    { symbol: 'ADA/USDT', base: 'ADA', quote: 'USDT' },
    { symbol: 'TRX/USDT', base: 'TRX', quote: 'USDT' },
    { symbol: 'XRP/BTC', base: 'XRP', quote: 'BTC' },
    { symbol: 'SHIB/USDT', base: 'SHIB', quote: 'USDT' },
    { symbol: 'LTC/USDT', base: 'LTC', quote: 'USDT' },
    { symbol: 'AVAX/USDT', base: 'AVAX', quote: 'USDT' },
    { symbol: 'MATIC/USDT', base: 'MATIC', quote: 'USDT' },
    { symbol: 'DOT/BTC', base: 'DOT', quote: 'BTC' },
    { symbol: 'TON/USDT', base: 'TON', quote: 'USDT' },
    { symbol: 'NEAR/USDT', base: 'NEAR', quote: 'USDT' },
    { symbol: 'LINK/ETH', base: 'LINK', quote: 'ETH' },
    { symbol: 'OP/USDT', base: 'OP', quote: 'USDT' },
    { symbol: 'ARB/USDT', base: 'ARB', quote: 'USDT' },
    { symbol: 'MNT/BTC', base: 'MNT', quote: 'BTC' },
    { symbol: 'DAI/USDT', base: 'DAI', quote: 'USDT' },
    { symbol: 'UNI/USDT', base: 'UNI', quote: 'USDT' },
    { symbol: 'ATOM/USDT', base: 'ATOM', quote: 'USDT' },
    { symbol: 'ICP/USDT', base: 'ICP', quote: 'USDT' },
    { symbol: 'VET/USDT', base: 'VET', quote: 'USDT' },
    { symbol: 'FIL/USDT', base: 'FIL', quote: 'USDT' },
    { symbol: 'ETC/USDT', base: 'ETC', quote: 'USDT' },
    { symbol: 'HBAR/USDT', base: 'HBAR', quote: 'USDT' },
    { symbol: 'XLM/USDT', base: 'XLM', quote: 'USDT' },
    { symbol: 'ALGO/USDT', base: 'ALGO', quote: 'USDT' },
    { symbol: 'EGLD/USDT', base: 'EGLD', quote: 'USDT' },
    { symbol: 'FLOW/USDT', base: 'FLOW', quote: 'USDT' },
    { symbol: 'THETA/USDT', base: 'THETA', quote: 'USDT' },
    { symbol: 'APE/USDT', base: 'APE', quote: 'USDT' },
    { symbol: 'AXS/USDT', base: 'AXS', quote: 'USDT' },
    { symbol: 'SAND/USDT', base: 'SAND', quote: 'USDT' },
    { symbol: 'MANA/USDT', base: 'MANA', quote: 'USDT' },
    { symbol: 'ENJ/USDT', base: 'ENJ', quote: 'USDT' },
    { symbol: 'CHZ/USDT', base: 'CHZ', quote: 'USDT' },
    { symbol: 'GRT/USDT', base: 'GRT', quote: 'USDT' },
    { symbol: 'AAVE/USDT', base: 'AAVE', quote: 'USDT' },
    { symbol: 'COMP/USDT', base: 'COMP', quote: 'USDT' },
    { symbol: 'MKR/USDT', base: 'MKR', quote: 'USDT' },
    { symbol: 'SUSHI/USDT', base: 'SUSHI', quote: 'USDT' },
    { symbol: 'UNI/ETH', base: 'UNI', quote: 'ETH' },
    { symbol: 'DOT/USDT', base: 'DOT', quote: 'USDT' },
    { symbol: 'ARB/ETH', base: 'ARB', quote: 'ETH' },
    { symbol: 'OP/ETH', base: 'OP', quote: 'ETH' },
    { symbol: 'NEAR/BTC', base: 'NEAR', quote: 'BTC' },
    { symbol: 'TON/BTC', base: 'TON', quote: 'BTC' },
    { symbol: 'LTC/BTC', base: 'LTC', quote: 'BTC' },
];


// --- MODIFIED: getBasePriceFromCoinGecko to fetch live data with caching ---
async function getBasePriceFromCoinGecko(baseSymbol, quoteSymbol) {
  const baseId = COINGECKO_SYMBOL_MAPPING[baseSymbol];
  const quoteVsCurrency = quoteSymbol.toLowerCase(); // CoinGecko often uses lowercase for vs_currencies

  if (!baseId) {
    logger.error(`Unknown base symbol for CoinGecko: ${baseSymbol}`);
    throw new Error(`Invalid base currency for price lookup: ${baseSymbol}`);
  }

  // --- Cache Check ---
  const cacheKey = `${baseId}-${quoteVsCurrency}`;
  const cachedData = priceCache[cacheKey];
  const now = Date.now();

  if (cachedData && (now - cachedData.timestamp < CACHE_TTL)) {
    logger.debug(`Fetching ${baseSymbol}/${quoteSymbol} from cache.`);
    return cachedData.price;
  }

  // --- Fetch from CoinGecko API ---
  try {
    logger.info(`Fetching live price for ${baseSymbol}/${quoteSymbol} from CoinGecko...`);
    const params = {
      ids: baseId,
      vs_currencies: quoteVsCurrency,
      x_cg_demo_api_key: COINGECKO_API_KEY, // Use if you have a pro API key
      // Include 'x_cg_pro_api_key' for CoinGecko's Pro API
    };

    const response = await axios.get(`${COINGECKO_API_BASE_URL}/simple/price`, { params });

    const priceData = response.data;
    if (!priceData || !priceData[baseId] || !priceData[baseId][quoteVsCurrency]) {
      throw new Error(`Could not get price data for ${baseSymbol}/${quoteSymbol} from CoinGecko.`);
    }

    const livePrice = new Decimal(priceData[baseId][quoteVsCurrency]);

    // --- Update Cache ---
    priceCache[cacheKey] = {
      price: livePrice,
      timestamp: now,
    };

    logger.info(`Live price fetched for ${baseSymbol}/${quoteSymbol}: ${livePrice.toFixed(8)}`);
    return livePrice;

  } catch (error) {
    logger.error(`Error fetching live price from CoinGecko for ${baseSymbol}/${quoteSymbol}: ${error.message}`);
    // Fallback if API fails: you might want to return an old cached price,
    // a default value, or throw an error to halt the transaction.
    // For now, re-throw to ensure transactions are handled correctly if price is unavailable.
    throw new Error(`Failed to get live price for ${baseSymbol}/${quoteCurrency}. Please try again later.`);
  }
}

// Function to generate simulated bid/ask prices with an admin-controlled spread
export async function getSimulatedBidAskPrices(baseCurrency, quoteCurrency) {
  const pairSymbol = `${baseCurrency}/${quoteCurrency}`;
  // The 'basePrice' now comes directly from the live CoinGecko data
  const basePrice = await getBasePriceFromCoinGecko(baseCurrency, quoteCurrency);

  const config = adminSpreadSettings[pairSymbol] || adminSpreadSettings['DEFAULT'];
  const minSpread = new Decimal(config.minSpreadPct);
  const maxSpread = new Decimal(config.maxSpreadPct);

  const randomFactor = new Decimal(Math.random());
  const currentSpreadPct = minSpread.plus(maxSpread.minus(minSpread).times(randomFactor));

  const halfSpread = basePrice.times(currentSpreadPct).dividedBy(2);
  const askPrice = basePrice.plus(halfSpread);
  const bidPrice = basePrice.minus(halfSpread);

  logger.debug(`Live Spread calculation for ${pairSymbol}: Bid=${bidPrice.toFixed(8)}, Ask=${askPrice.toFixed(8)}, Mid=${basePrice.toFixed(8)}, SpreadPct=${currentSpreadPct.times(100).toFixed(4)}%`);

  return { bid: bidPrice, ask: askPrice, mid: basePrice };
}

// Function to update admin spread settings (used by admin API route)
export function updateAdminSpreadSettings(settingsUpdate) {
  // This logic remains the same
  if (settingsUpdate.isDefault) {
    adminSpreadSettings['DEFAULT'] = {
      minSpreadPct: settingsUpdate.minSpreadPct,
      maxSpreadPct: settingsUpdate.maxSpreadPct
    };
    logger.info('Default spread settings updated.');
  } else if (settingsUpdate.pair) {
    const pairUpper = settingsUpdate.pair.toUpperCase();
    if (!AVAILABLE_TRADING_PAIRS.some(p => p.symbol === pairUpper)) {
      logger.warn(`Attempted to update spread for invalid pair: ${pairUpper}`);
      throw new Error(`Invalid trading pair: ${pairUpper}`);
    }
    adminSpreadSettings[pairUpper] = {
      minSpreadPct: settingsUpdate.minSpreadPct,
      maxSpreadPct: settingsUpdate.maxSpreadPct
    };
    logger.info(`Spread settings for ${pairUpper} updated.`);
  }
}
