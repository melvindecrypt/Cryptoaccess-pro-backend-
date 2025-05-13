// controllers/exchangeController.js
const { formatResponse } = require('../utils/helpers');
const logger = require('../utils/logger');
const Wallet = require('../models/Wallet');
const Decimal = require('decimal.js');

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

// In a real internal system, you might store these in a database
const AVAILABLE_TRADING_PAIRS = [
  { symbol: 'BTC/USD', base: 'BTC', quote: 'USD' },
  { symbol: 'ETH/USD', base: 'ETH', quote: 'USD' },
  { symbol: 'ETH/BTC', base: 'ETH', quote: 'BTC' },
  { symbol: 'SOL/USD', base: 'SOL', quote: 'USD' },
  // Add more trading pairs as needed
];

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
