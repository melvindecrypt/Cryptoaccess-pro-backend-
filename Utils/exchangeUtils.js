import { Decimal } from 'decimal.js';
import { logger } from './logger';
import axios from 'axios';

const COINGECKO_API_BASE_URL = 'https://api.coingecko.com/api/v3';
const COINGECKO_API_KEY = process.env.COINGECKO_API_KEY || '';

const priceCache: { [key: string]: { price: Decimal, timestamp: number } } = {};
const CACHE_TTL = 15 * 1000; // 15 seconds

const COINGECKO_SYMBOL_MAPPING: { [key: string]: string } = {
  'BTC': 'bitcoin',
  'ETH': 'ethereum',
  'USDT': 'tether',
  'BNB': 'binancecoin',
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
};

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
  'DAI/USDT': { minSpreadPct: 0.0001, maxSpreadPct: 0.0003 },
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

async function getBasePriceFromCoinGecko(baseSymbol: string, quoteSymbol: string): Promise<Decimal> {
  const baseId = COINGECKO_SYMBOL_MAPPING[baseSymbol];
  const quoteVsCurrency = quoteSymbol.toLowerCase();

  if (!baseId) {
    logger.error(`Unknown base symbol for CoinGecko: ${baseSymbol}`);
    throw new Error(`Invalid base currency for price lookup: ${baseSymbol}`);
  }

  const cacheKey = `${baseId}-${quoteVsCurrency}`;
  const cachedData = priceCache[cacheKey];
  const now = Date.now();

  if (cachedData && (now - cachedData.timestamp < CACHE_TTL)) {
    logger.debug(`Fetching ${baseSymbol}/${quoteSymbol} from cache.`);
    return cachedData.price;
  }

  try {
    logger.info(`Fetching live price for ${baseSymbol}/${quoteSymbol} from CoinGecko...`);
    const params: { [key: string]: string } = {
      ids: baseId,
      vs_currencies: quoteVsCurrency,
    };
    if (COINGECKO_API_KEY) {
      params['x_cg_demo_api_key'] = COINGECKO_API_KEY;
    }

    const response = await axios.get(`${COINGECKO_API_BASE_URL}/simple/price`, { params });

    const priceData = response.data;
    if (!priceData || !priceData[baseId] || !priceData[baseId][quoteVsCurrency]) {
      throw new Error(`Could not get price data for ${baseSymbol}/${quoteSymbol} from CoinGecko.`);
    }

    const livePrice = new Decimal(priceData[baseId][quoteVsCurrency]);

    priceCache[cacheKey] = {
      price: livePrice,
      timestamp: now,
    };

    logger.info(`Live price fetched for ${baseSymbol}/${quoteSymbol}: ${livePrice.toFixed(8)}`);
    return livePrice;

  } catch (error: any) {
    logger.error(`Error fetching live price from CoinGecko for ${baseSymbol}/${quoteSymbol}: ${error.message}`);
    throw new Error(`Failed to get live price for ${baseSymbol}/${quoteSymbol}. Please try again later.`);
  }
}

export async function getSimulatedBidAskPrices(baseCurrency: string, quoteCurrency: string): Promise<{ bid: Decimal; ask: Decimal; mid: Decimal }> {
  const pairSymbol = `${baseCurrency}/${quoteCurrency}`;
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

export function updateAdminSpreadSettings(settingsUpdate: { isDefault?: boolean; pair?: string; minSpreadPct: number; maxSpreadPct: number }): void {
  if (settingsUpdate.isDefault) {
    adminSpreadSettings['DEFAULT'] = {
      minSpreadPct: settingsUpdate.minSpreadPct,
      maxSpreadPct: settingsUpdate.maxSpreadPct
    };
    logger.info('Default spread settings updated.');
  } else if (settingsUpdate.pair) {
    const pairUpper = settingsUpdate.pair.toUpperCase();
    const pairExists = AVAILABLE_TRADING_PAIRS.some(p => p.symbol === pairUpper);

    if (!pairExists) {
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
