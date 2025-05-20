const exchangeController = require('../../controllers/exchangeController');
const { formatResponse } = require('../../utils/helpers');
const logger = require('../../utils/logger');

// Mock external modules
jest.mock('../../utils/helpers', () => ({
    formatResponse: jest.fn((success, message, data) => ({ success, message, data })),
}));
jest.mock('../../utils/logger', () => ({
    info: jest.fn(),
    error: jest.fn(),
}));

// Mock the internal getOrderBook function
const mockGetOrderBook = jest.fn();

// Mock the global AVAILABLE_TRADING_PAIRS and initializeTradingPairs
let AVAILABLE_TRADING_PAIRS_Original;
let initializeTradingPairsOriginal;

beforeAll(() => {
    AVAILABLE_TRADING_PAIRS_Original = exchangeController.__get__('AVAILABLE_TRADING_PAIRS');
    initializeTradingPairsOriginal = exchangeController.__get__('initializeTradingPairs');

    exchangeController.__set__('AVAILABLE_TRADING_PAIRS', [
        { symbol: 'BTC/USD', base: 'BTC', quote: 'USD' },
        { symbol: 'ETH/BTC', base: 'ETH', quote: 'BTC' },
    ]);
    exchangeController.__set__('initializeTradingPairs', jest.fn()); // Prevent actual initialization
    exchangeController.__set__('getOrderBook', mockGetOrderBook); // Inject mock
});

afterAll(() => {
    exchangeController.__set__('AVAILABLE_TRADING_PAIRS', AVAILABLE_TRADING_PAIRS_Original);
    exchangeController.__set__('initializeTradingPairs', initializeTradingPairsOriginal);
    exchangeController.__set__('getOrderBook', exchangeController.__get__('getOrderBook')); // Restore original
});

describe('exchangeController.getMarketData', () => {
    let req, res;
    let mockOrderBookState;

    beforeEach(() => {
        jest.clearAllMocks();

        mockOrderBookState = {
            buyOrders: [
                { userId: 'u1', price: 25000, amount: 0.1 },
                { userId: 'u2', price: 24900, amount: 0.2 },
                { userId: 'u3', price: 24800, amount: 0.3 },
                { userId: 'u4', price: 24700, amount: 0.4 },
                { userId: 'u5', price: 24600, amount: 0.5 },
                { userId: 'u6', price: 24500, amount: 0.6 },
                { userId: 'u7', price: 24400, amount: 0.7 },
                { userId: 'u8', price: 24300, amount: 0.8 },
                { userId: 'u9', price: 24200, amount: 0.9 },
                { userId: 'u10', price: 24100, amount: 1.0 },
                { userId: 'u11', price: 24000, amount: 1.1 }, // This one should be sliced off
            ],
            sellOrders: [
                { userId: 's1', price: 25010, amount: 0.1 },
                { userId: 's2', price: 25020, amount: 0.2 },
                { userId: 's3', price: 25030, amount: 0.3 },
                { userId: 's4', price: 25040, amount: 0.4 },
                { userId: 's5', price: 25050, amount: 0.5 },
                { userId: 's6', price: 25060, amount: 0.6 },
                { userId: 's7', price: 25070, amount: 0.7 },
                { userId: 's8', price: 25080, amount: 0.8 },
                { userId: 's9', price: 25090, amount: 0.9 },
                { userId: 's10', price: 25100, amount: 1.0 },
                { userId: 's11', price: 25200, amount: 1.1 }, // This one should be sliced off
            ],
        };
        mockGetOrderBook.mockReturnValue(mockOrderBookState);

        req = {
            query: {
                pair: 'BTC/USD',
            },
        };
        res = {
            json: jest.fn(),
            status: jest.fn().mockReturnThis(),
        };

        jest.spyOn(console, 'error').mockImplementation(() => {});
    });

    afterEach(() => {
        jest.restoreAllMocks();
    });

    // --- TEST SUITE: VALIDATION ---
    describe('Validation', () => {
        test('should return 400 if pair parameter is missing', async () => {
            req.query.pair = undefined;
            await exchangeController.getMarketData(req, res);
            expect(res.status).toHaveBeenCalledWith(400);
            expect(res.json).toHaveBeenCalledWith(formatResponse(false, 'Invalid trading pair'));
            expect(mockGetOrderBook).not.toHaveBeenCalled();
        });

        test('should return 400 if pair is not in AVAILABLE_TRADING_PAIRS', async () => {
            req.query.pair = 'XYZ/ABC';
            await exchangeController.getMarketData(req, res);
            expect(res.status).toHaveBeenCalledWith(400);
            expect(res.json).toHaveBeenCalledWith(formatResponse(false, 'Invalid trading pair'));
            expect(mockGetOrderBook).not.toHaveBeenCalled();
        });
    });

    // --- TEST SUITE: SUCCESSFUL RETRIEVAL ---
    describe('Successful Market Data Retrieval', () => {
        test('should return 200 and top 10 buy and sell orders for a valid pair', async () => {
            await exchangeController.getMarketData(req, res);

            expect(mockGetOrderBook).toHaveBeenCalledWith('BTC/USD');
            expect(res.status).not.toHaveBeenCalled();
            expect(res.json).toHaveBeenCalledWith(
                formatResponse(true, 'Order book for BTC/USD', {
                    buyOrders: expect.arrayContaining(mockOrderBookState.buyOrders.slice(0, 10)),
                    sellOrders: expect.arrayContaining(mockOrderBookState.sellOrders.slice(0, 10)),
                })
            );
            const responseData = res.json.mock.calls[0][0].data;
            expect(responseData.buyOrders.length).toBe(10);
            expect(responseData.sellOrders.length).toBe(10);
            expect(logger.error).not.toHaveBeenCalled();
        });

        test('should return all available orders if less than 10', async () => {
            mockOrderBookState.buyOrders = [{ userId: 'u1', price: 100, amount: 1 }];
            mockOrderBookState.sellOrders = [{ userId: 's1', price: 101, amount: 1 }];

            await exchangeController.getMarketData(req, res);

            const responseData = res.json.mock.calls[0][0].data;
            expect(responseData.buyOrders.length).toBe(1);
            expect(responseData.sellOrders.length).toBe(1);
            expect(res.json).toHaveBeenCalledWith(
                formatResponse(true, 'Order book for BTC/USD', {
                    buyOrders: [{ userId: 'u1', price: 100, amount: 1 }],
                    sellOrders: [{ userId: 's1', price: 101, amount: 1 }],
                })
            );
        });

        test('should return empty arrays if no orders exist for the pair', async () => {
            mockOrderBookState.buyOrders = [];
            mockOrderBookState.sellOrders = [];

            await exchangeController.getMarketData(req, res);

            const responseData = res.json.mock.calls[0][0].data;
            expect(responseData.buyOrders.length).toBe(0);
            expect(responseData.sellOrders.length).toBe(0);
            expect(res.json).toHaveBeenCalledWith(
                formatResponse(true, 'Order book for BTC/USD', {
                    buyOrders: [],
                    sellOrders: [],
                })
            );
        });
    });

    // --- TEST SUITE: ERROR HANDLING ---
    describe('Error Handling', () => {
        test('should return 500 if getOrderBook throws an error', async () => {
            const mockError = new Error('Order book internal error');
            mockGetOrderBook.mockImplementation(() => { throw mockError; });

            await exchangeController.getMarketData(req, res);

            expect(res.status).toHaveBeenCalledWith(500);
            expect(res.json).toHaveBeenCalledWith(formatResponse(false, 'Server error fetching market data'));
            expect(logger.error).toHaveBeenCalledWith(`Error fetching market data: ${mockError.message}`);
        });

        test('should return 500 for general unexpected errors', async () => {
            const unexpectedError = new Error('Unknown error');
            // Simulate error by making res.json throw
            res.json.mockImplementation(() => { throw unexpectedError; });

            await exchangeController.getMarketData(req, res);

            expect(res.status).toHaveBeenCalledWith(500);
            expect(res.json).toHaveBeenCalledWith(formatResponse(false, 'Server error fetching market data'));
            expect(logger.error).toHaveBeenCalledWith(`Error fetching market data: ${unexpectedError.message}`);
        });
    });
});
