import { Decimal } from 'decimal.js';
import { logger } from './logger';
import axios from 'axios';

// --- CoinGecko API Configuration ---
const COINGECKO_API_BASE_URL = 'https://api.coingecko.com/api/v3';
const COINGECKO_API_KEY = process.env.COINGECKO_API_KEY || ''; // Ensure this is set in your .env

// In-memory caches and their TTLs
const priceCache: { [key: string]: { price: Decimal, timestamp: number } } = {};
const CACHE_TTL_PRICES = 15 * 1000; // 15 seconds for individual coin prices

// Cache for the CoinGecko ID mapping
let coinGeckoIdMap: { [symbol: string]: string } = {}; // This will be populated dynamically
const CACHE_TTL_ID_MAP = 24 * 60 * 60 * 1000; // 24 hours for the ID map
let lastIdMapFetchTime = 0;

// --- Your existing adminSpreadSettings and AVAILABLE_TRADING_PAIRS ---
export let adminSpreadSettings: {
    [pair: string]: { minSpreadPct: number; maxSpreadPct: number };
} = {
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
    'DOT/BTC': { minSpreadPct: 0.0012, maxSpreadPct: 0.0026 },
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

/**
 * Fetches the complete list of coins from CoinGecko and builds an ID map.
 * This map is cached for efficiency.
 */
async function fetchAndBuildCoinGeckoIdMap(): Promise<void> {
    const now = Date.now();
    // Check if the map is already populated and still fresh
    if (Object.keys(coinGeckoIdMap).length > 0 && (now - lastIdMapFetchTime < CACHE_TTL_ID_MAP)) {
        logger.debug('Using cached CoinGecko ID map.');
        return;
    }

    logger.info('Fetching fresh CoinGecko ID map...');
    try {
        const params: { [key: string]: string } = {};
        if (COINGECKO_API_KEY) {
            params['x_cg_demo_api_key'] = COINGECKO_API_KEY;
        }

        const response = await axios.get(`${COINGECKO_API_BASE_URL}/coins/list`, { params });

        const newMap: { [symbol: string]: string } = {};
        response.data.forEach((coin: { id: string; symbol: string; name: string }) => {
            // CoinGecko symbols are usually lowercase. Store both upper and lower for flexibility.
            const symbolUpper = coin.symbol.toUpperCase();
            const symbolLower = coin.symbol.toLowerCase();

            // Prioritize the first encountered ID for a given symbol.
            // If more sophisticated conflict resolution is needed (e.g., by market cap),
            // this logic would need to be expanded (potentially using /coins/markets endpoint).
            if (!newMap[symbolUpper]) {
                newMap[symbolUpper] = coin.id;
            }
            if (!newMap[symbolLower]) {
                 newMap[symbolLower] = coin.id;
            }
        });

        coinGeckoIdMap = newMap;
        lastIdMapFetchTime = now;
        logger.info(`CoinGecko ID map built with ${Object.keys(newMap).length} entries.`);
    } catch (error: any) {
        logger.error(`Error fetching CoinGecko coin list: ${error.message}`);
        // In a production environment, if this fails on startup, consider:
        // 1. A more aggressive retry mechanism.
        // 2. Preventing server startup if the map is critical for operation.
        // 3. Using a stale map from persistent storage if available.
    }
}

/**
 * Gets the CoinGecko ID for a given symbol using the dynamically built map.
 * Attempts to trigger a refresh if the ID is not found, but doesn't await it.
 */
function getCoinGeckoId(symbol: string): string | undefined {
    const id = coinGeckoIdMap[symbol.toUpperCase()] || coinGeckoIdMap[symbol.toLowerCase()];
    if (!id) {
        logger.warn(`No CoinGecko ID found for symbol: ${symbol}. Attempting to refresh map in background.`);
        // Try to trigger a map refresh if not found, but don't await it here to avoid blocking
        // This is a "best effort" refresh. The current request will still fail.
        fetchAndBuildCoinGeckoIdMap().catch(err => logger.error(`Failed to refresh ID map: ${err.message}`));
    }
    return id;
}

/**
 * Fetches the base currency price from CoinGecko, with caching.
 */
async function getBasePriceFromCoinGecko(baseSymbol: string, quoteSymbol: string): Promise<Decimal> {
  // Ensure the ID map is ready and fresh before proceeding
  // This call makes the function self-sufficient regarding the ID map
  if (Object.keys(coinGeckoIdMap).length === 0 || (Date.now() - lastIdMapFetchTime >= CACHE_TTL_ID_MAP)) {
      await fetchAndBuildCoinGeckoIdMap();
      // If map is still empty after attempting to fetch, throw an error
      if (Object.keys(coinGeckoIdMap).length === 0) {
          throw new Error('CoinGecko ID map is not available. Cannot fetch prices.');
      }
  }

  const baseId = getCoinGeckoId(baseSymbol);
  // CoinGecko often uses lowercase for vs_currencies
  const quoteVsCurrency = quoteSymbol.toLowerCase();

  if (!baseId) {
    logger.error(`No CoinGecko ID found for base symbol: ${baseSymbol}. Cannot fetch price.`);
    throw new Error(`Invalid base currency for price lookup: ${baseSymbol}`);
  }

  // --- Price Cache Check ---
  const cacheKey = `${baseId}-${quoteVsCurrency}`;
  const cachedData = priceCache[cacheKey];
  const now = Date.now();

  if (cachedData && (now - cachedData.timestamp < CACHE_TTL_PRICES)) {
    logger.debug(`Fetching ${baseSymbol}/${quoteSymbol} from price cache.`);
    return cachedData.price;
  }

  // --- Fetch from CoinGecko API ---
  try {
    logger.info(`Fetching live price for ${baseSymbol}/${quoteSymbol} from CoinGecko API...`);
    const params: { [key: string]: string } = {
      ids: baseId,
      vs_currencies: quoteVsCurrency,
    };
    if (COINGECKO_API_KEY) {
      params['x_cg_demo_api_key'] = COINGECKO_API_KEY; // Use if you have a pro API key
    }

    const response = await axios.get(`${COINGECKO_API_BASE_URL}/simple/price`, { params });

    const priceData = response.data;
    if (!priceData || !priceData[baseId] || !priceData[baseId][quoteVsCurrency]) {
      throw new Error(`CoinGecko did not return price data for ${baseSymbol}/${quoteSymbol}.`);
    }

    const livePrice = new Decimal(priceData[baseId][quoteVsCurrency]);

    // --- Update Price Cache ---
    priceCache[cacheKey] = {
      price: livePrice,
      timestamp: now,
    };

    logger.info(`Live price fetched for ${baseSymbol}/${quoteSymbol}: ${livePrice.toFixed(8)}`);
    return livePrice;

  } catch (error: any) {
    logger.error(`Error fetching live price from CoinGecko for ${baseSymbol}/${quoteSymbol}: ${error.message}`);
    // If the API call fails, attempt to return a stale price from cache if available.
    if (cachedData) {
        logger.warn(`Returning stale price for ${baseSymbol}/${quoteSymbol} due to API error.`);
        return cachedData.price;
    }
    // If no cached data and API fails, throw an error.
    throw new Error(`Failed to get live price for ${baseSymbol}/${quoteSymbol}. Please try again later.`);
  }
}

// Ensure the ID map is built when the module is loaded.
// This will happen once when your server starts.
fetchAndBuildCoinGeckoIdMap().catch(err => logger.error(`Initial CoinGecko ID map fetch failed: ${err.message}`));


// --- Existing functions (remain largely the same, but now rely on the dynamic price fetching) ---
export async function getSimulatedBidAskPrices(baseCurrency: string, quoteCurrency: string): Promise<{ bid: Decimal; ask: Decimal; mid: Decimal }> {
    const pairSymbol = `${baseCurrency}/${quoteCurrency}`;
    const basePrice = await getBasePriceFromCoinGecko(baseCurrency, quoteCurrency); // This now uses the dynamic mapping

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

export function updateAdminSpreadSettings(settingsUpdate: { isDefault?: boolean; pair?: string; minSpreadPct: number; maxSpreadPct: number }): void {
    if (settingsUpdate.isDefault) {
        adminSpreadSettings['DEFAULT'] = {
            minSpreadPct: settingsUpdate.minSpreadPct,
            maxSpreadPct: settingsUpdate.maxSpreadPct
        };
        logger.info('Default spread settings updated.');
    } else if (settingsUpdate.pair) {
        const pairUpper = settingsUpdate.pair.toUpperCase();
        // It's good that you check for pair existence here.
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
