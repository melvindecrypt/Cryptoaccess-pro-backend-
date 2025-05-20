const exchangeController = require('../../controllers/exchangeController');
const Wallet = require('../../models/Wallet');
const Transaction = require('../../models/Transaction');
const logger = require('../../utils/logger');
const Decimal = require('decimal.js');
const mongoose = require('mongoose');

// Mock external modules
jest.mock('../../models/Wallet');
jest.mock('../../models/Transaction');
jest.mock('../../utils/logger', () => ({
    info: jest.fn(),
    error: jest.fn(),
}));

// Mock mongoose session and transaction capabilities
const mockSession = {
    startTransaction: jest.fn(),
    commitTransaction: jest.fn(),
    abortTransaction: jest.fn(),
    endSession: jest.fn(),
};
jest.spyOn(mongoose, 'startSession').mockResolvedValue(mockSession);

// Mock the internal functions that matchOrders and executeTrade rely on
const mockGetOrderBook = jest.fn(); // We'll control this directly
const mockSortBuyOrders = jest.fn((a, b) => new Decimal(b.price).minus(a.price).toNumber());
const mockSortSellOrders = jest.fn((a, b) => new Decimal(a.price).minus(b.price).toNumber());

// Create helper to directly call matchOrders and executeTrade (as they are internal)
// This pattern requires either temporary exports or using __set__ on the module
let matchOrdersFunc;
let executeTradeFunc;
let getOrderBookFunc; // for setting up mock behavior
let sortBuyOrdersFunc;
let sortSellOrdersFunc;

beforeAll(() => {
    // Capture originals and inject mocks
    matchOrdersFunc = exchangeController.__get__('matchOrders');
    executeTradeFunc = exchangeController.__get__('executeTrade');
    getOrderBookFunc = exchangeController.__get__('getOrderBook'); // Get the original to see its structure
    sortBuyOrdersFunc = exchangeController.__get__('sortBuyOrders');
    sortSellOrdersFunc = exchangeController.__get__('sortSellOrders');

    exchangeController.__set__('getOrderBook', mockGetOrderBook);
    exchangeController.__set__('sortBuyOrders', mockSortBuyOrders);
    exchangeController.__set__('sortSellOrders', mockSortSellOrders);

    // No need to mock initializeTradingPairs and AVAILABLE_TRADING_PAIRS here
    // as matchOrders and executeTrade don't directly depend on them,
    // and we are manually controlling orderBook state.
});

afterAll(() => {
    // Restore originals
    exchangeController.__set__('getOrderBook', getOrderBookFunc);
    exchangeController.__set__('matchOrders', matchOrdersFunc); // Restore original only if we don't need to test it directly
    exchangeController.__set__('executeTrade', executeTradeFunc); // Restore original only if we don't need to test it directly
    exchangeController.__set__('sortBuyOrders', sortBuyOrdersFunc);
    exchangeController.__set__('sortSellOrders', sortSellOrdersFunc);
});

describe('exchangeController.matchOrders and executeTrade', () => {
    let buyerWallet, sellerWallet;
    let orderBookState;

    beforeEach(() => {
        jest.clearAllMocks();

        buyerWallet = {
            userId: 'buyer1',
            _id: 'buyerWalletId',
            balances: { 'USD': 1000, 'BTC': 0 },
            transactions: [],
            save: jest.fn().mockResolvedValue(true),
        };
        sellerWallet = {
            userId: 'seller1',
            _id: 'sellerWalletId',
            balances: { 'BTC': 1, 'USD': 0 },
            transactions: [],
            save: jest.fn().mockResolvedValue(true),
        };

        // Mock Wallet.findOne for executeTrade
        Wallet.findOne
            .mockResolvedValueOnce(buyerWallet)
            .mockResolvedValueOnce(sellerWallet);

        Transaction.create.mockResolvedValue(true); // Assuming Transaction model is used

        orderBookState = {
            buyOrders: [],
            sellOrders: [],
        };
        mockGetOrderBook.mockReturnValue(orderBookState); // Ensure getOrderBook returns the current state

        jest.spyOn(console, 'error').mockImplementation(() => {});
    });

    afterEach(() => {
        jest.restoreAllMocks();
    });

    // --- TEST SUITE: matchOrders ---
    describe('matchOrders', () => {
        test('should execute a full match when buy and sell orders cross perfectly', async () => {
            orderBookState.buyOrders.push({ userId: 'buyer1', price: 25000, amount: 0.1 });
            orderBookState.sellOrders.push({ userId: 'seller1', price: 24999, amount: 0.1 });

            // Call the actual internal matchOrders function
            await matchOrdersFunc('BTC/USD', mockSession);

            // Expect orders to be removed after full fill
            expect(orderBookState.buyOrders.length).toBe(0);
            expect(orderBookState.sellOrders.length).toBe(0);

            // Verify executeTrade was called
            expect(Wallet.findOne).toHaveBeenCalledTimes(2); // For buyer and seller
            expect(buyerWallet.save).toHaveBeenCalledTimes(1);
            expect(sellerWallet.save).toHaveBeenCalledTimes(1);
            expect(Transaction.create).toHaveBeenCalledTimes(2); // One for buyer, one for seller
            expect(logger.error).not.toHaveBeenCalled();
        });

        test('should execute a partial match and leave remaining order', async () => {
            orderBookState.buyOrders.push({ userId: 'buyer1', price: 25000, amount: 0.15 }); // Bigger buy
            orderBookState.sellOrders.push({ userId: 'seller1', price: 24999, amount: 0.1 }); // Smaller sell

            await matchOrdersFunc('BTC/USD', mockSession);

            // Sell order should be fully filled and removed
            expect(orderBookState.sellOrders.length).toBe(0);
            // Buy order should be partially filled
            expect(orderBookState.buyOrders.length).toBe(1);
            expect(orderBookState.buyOrders[0].amount).toBeCloseTo(0.05); // 0.15 - 0.1

            // Verify executeTrade was called once
            expect(Wallet.findOne).toHaveBeenCalledTimes(2);
            expect(buyerWallet.save).toHaveBeenCalledTimes(1);
            expect(sellerWallet.save).toHaveBeenCalledTimes(1);
            expect(Transaction.create).toHaveBeenCalledTimes(2);
        });

        test('should not match if prices do not cross', async () => {
            orderBookState.buyOrders.push({ userId: 'buyer1', price: 24000, amount: 0.1 });
            orderBookState.sellOrders.push({ userId: 'seller1', price: 25000, amount: 0.1 }); // Sell price higher than buy

            await matchOrdersFunc('BTC/USD', mockSession);

            // Orders should remain untouched
            expect(orderBookState.buyOrders.length).toBe(1);
            expect(orderBookState.sellOrders.length).toBe(1);

            expect(Wallet.findOne).not.toHaveBeenCalled(); // No trade executed
            expect(Transaction.create).not.toHaveBeenCalled();
        });

        test('should handle multiple matches in a single call', async () => {
            // Setup multiple crossing orders
            orderBookState.buyOrders.push(
                { userId: 'buyer1', price: 25000, amount: 0.1 },
                { userId: 'buyer2', price: 24900, amount: 0.2 }
            );
            orderBookState.sellOrders.push(
                { userId: 'seller1', price: 24950, amount: 0.05 },
                { userId: 'seller2', price: 24980, amount: 0.1 }
            );

            // Mock Wallet.findOne for multiple executeTrade calls
            const buyer2Wallet = { userId: 'buyer2', _id: 'b2Id', balances: { 'USD': 1000, 'BTC': 0 }, transactions: [], save: jest.fn().mockResolvedValue(true) };
            const seller2Wallet = { userId: 'seller2', _id: 's2Id', balances: { 'BTC': 1, 'USD': 0 }, transactions: [], save: jest.fn().mockResolvedValue(true) };

            Wallet.findOne
                .mockResolvedValueOnce(buyerWallet) // First buyer
                .mockResolvedValueOnce(sellerWallet) // First seller
                .mockResolvedValueOnce(buyerWallet) // Second buyer (partial fill scenario for buyer1)
                .mockResolvedValueOnce(seller2Wallet); // Second seller


            await matchOrdersFunc('BTC/USD', mockSession);

            // Expected outcome:
            // 1. buyer1 (0.1) matches seller1 (0.05) -> buyer1 remains 0.05
            // 2. buyer1 (0.05) matches seller2 (0.1) -> seller2 remains 0.05

            expect(orderBookState.buyOrders.length).toBe(1); // buyer2 remains
            expect(orderBookState.buyOrders[0]).toMatchObject({ userId: 'buyer2', amount: 0.2 });

            expect(orderBookState.sellOrders.length).toBe(1); // seller2 remains
            expect(orderBookState.sellOrders[0]).toMatchObject({ userId: 'seller2', amount: 0.05 });

            expect(Wallet.findOne).toHaveBeenCalledTimes(4); // 2 trades * 2 lookups
            expect(Transaction.create).toHaveBeenCalledTimes(4); // 2 trades * 2 transactions
        });
    });

    // --- TEST SUITE: executeTrade ---
    describe('executeTrade', () => {
        const pair = 'BTC/USD';
        const tradeAmount = 0.01;
        const tradePrice = 25000;
        const buyerId = 'buyer1';
        const sellerId = 'seller1';

        test('should update buyer and seller balances and record transactions', async () => {
            const initialBuyerUsd = buyerWallet.balances.USD;
            const initialBuyerBtc = buyerWallet.balances.BTC;
            const initialSellerUsd = sellerWallet.balances.USD;
            const initialSellerBtc = sellerWallet.balances.BTC;

            await executeTradeFunc(pair, buyerId, sellerId, tradeAmount, tradePrice, mockSession);

            // Verify buyer's balances
            expect(buyerWallet.balances.USD).toBeCloseTo(new Decimal(initialBuyerUsd).minus(new Decimal(tradeAmount).mul(tradePrice)).toNumber()); // 1000 - 250 = 750
            expect(buyerWallet.balances.BTC).toBeCloseTo(new Decimal(initialBuyerBtc).plus(tradeAmount).toNumber()); // 0 + 0.01 = 0.01

            // Verify seller's balances
            expect(sellerWallet.balances.BTC).toBeCloseTo(new Decimal(initialSellerBtc).minus(tradeAmount).toNumber()); // 1 - 0.01 = 0.99
            expect(sellerWallet.balances.USD).toBeCloseTo(new Decimal(initialSellerUsd).plus(new Decimal(tradeAmount).mul(tradePrice)).toNumber()); // 0 + 250 = 250

            // Verify wallet saves
            expect(buyerWallet.save).toHaveBeenCalledWith({ session: mockSession });
            expect(sellerWallet.save).toHaveBeenCalledWith({ session: mockSession });
            expect(buyerWallet.save).toHaveBeenCalledTimes(1);
            expect(sellerWallet.save).toHaveBeenCalledTimes(1);

            // Verify transaction records
            expect(buyerWallet.transactions.length).toBe(1);
            expect(buyerWallet.transactions[0]).toMatchObject({
                type: 'trade',
                pair,
                tradeType: 'BUY',
                amount: tradeAmount,
                price: tradePrice,
                status: 'COMPLETED',
                counterParty: sellerId,
            });

            expect(sellerWallet.transactions.length).toBe(1);
            expect(sellerWallet.transactions[0]).toMatchObject({
                type: 'trade',
                pair,
                tradeType: 'SELL',
                amount: tradeAmount,
                price: tradePrice,
                status: 'COMPLETED',
                counterParty: buyerId,
            });
            expect(logger.error).not.toHaveBeenCalled();
        });

        test('should log error if buyer wallet not found during trade execution', async () => {
            Wallet.findOne
                .mockResolvedValueOnce(null) // Buyer wallet not found
                .mockResolvedValueOnce(sellerWallet);

            await executeTradeFunc(pair, buyerId, sellerId, tradeAmount, tradePrice, mockSession);

            expect(logger.error).toHaveBeenCalledWith('Error: Could not find buyer or seller wallet during trade execution.');
            expect(buyerWallet.save).not.toHaveBeenCalled();
            expect(sellerWallet.save).not.toHaveBeenCalled();
        });

        test('should log error if seller wallet not found during trade execution', async () => {
            Wallet.findOne
                .mockResolvedValueOnce(buyerWallet)
                .mockResolvedValueOnce(null); // Seller wallet not found

            await executeTradeFunc(pair, buyerId, sellerId, tradeAmount, tradePrice, mockSession);

            expect(logger.error).toHaveBeenCalledWith('Error: Could not find buyer or seller wallet during trade execution.');
            expect(buyerWallet.save).not.toHaveBeenCalled();
            expect(sellerWallet.save).not.toHaveBeenCalled();
        });

        test('should handle save errors gracefully without crashing (logged)', async () => {
            const saveError = new Error('Wallet save failed during trade');
            buyerWallet.save.mockRejectedValue(saveError); // Buyer wallet save fails

            await executeTradeFunc(pair, buyerId, sellerId, tradeAmount, tradePrice, mockSession);

            expect(logger.error).toHaveBeenCalledWith(expect.stringContaining('Wallet save failed during trade'));
            // The `matchOrders` function that calls `executeTrade` should handle the transaction rollback.
            // This test focuses on `executeTrade`'s direct logging.
        });
    });
});
