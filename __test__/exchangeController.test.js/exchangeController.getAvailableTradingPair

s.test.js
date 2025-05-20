const exchangeController = require('../../controllers/exchangeController');
const { formatResponse } = require('../../utils/helpers');
const logger = require('../../utils/logger');
const Currency = require('../../models/Currency'); // For initializeTradingPairs

// Mock external modules
jest.mock('../../utils/helpers', () => ({
    formatResponse: jest.fn((success, message, data) => ({ success, message, data })),
}));
jest.mock('../../utils/logger', () => ({
    info: jest.fn(),
    error: jest.fn(),
}));
jest.mock('../../models/Currency'); // Mock Currency to control initializeTradingPairs

// Mock console for the initialization process to prevent noise
jest.spyOn(console, 'log').mockImplementation(() => {});
jest.spyOn(console, 'error').mockImplementation(() => {});

// Re-import to ensure initializeTradingPairs runs with mocked Currency.find
let AVAILABLE_TRADING_PAIRS_EXPOSED; // To access the internal variable
beforeAll(async () => {
    Currency.find.mockResolvedValue([
        { symbol: 'BTC', isActive: true },
        { symbol: 'ETH', isActive: true },
        { symbol: 'USD', isActive: true },
    ]);
    jest.isolateModules(() => {
        const reloadedController = require('../../controllers/exchangeController');
        // This is a common way to get an internal variable for testing if it's not exported
        // If not, you'd just test the public `getAvailableTradingPairs`
        AVAILABLE_TRADING_PAIRS_EXPOSED = reloadedController.getAvailableTradingPairs.__get__('AVAILABLE_TRADING_PAIRS');
    });
});

afterAll(() => {
    jest.restoreAllMocks(); // Restore console after all tests
});

describe('exchangeController.getAvailableTradingPairs', () => {
    let req, res;

    beforeEach(() => {
        jest.clearAllMocks(); // Clear mocks before each test
        req = {};
        res = {
            json: jest.fn(),
            status: jest.fn().mockReturnThis(),
        };
    });

    test('should return 200 and the list of available trading pairs', async () => {
        await exchangeController.getAvailableTradingPairs(req, res);

        expect(res.status).not.toHaveBeenCalled(); // Default 200 OK
        expect(res.json).toHaveBeenCalledWith(
            formatResponse(true, 'Available trading pairs retrieved', expect.any(Array))
        );

        const responseData = res.json.mock.calls[0][0].data;
        // Assert that the array is not empty and contains expected elements
        expect(responseData.length).toBeGreaterThan(0);
        expect(responseData).toContainEqual({ symbol: 'BTC/USD', base: 'BTC', quote: 'USD' });
        expect(responseData).toContainEqual({ symbol: 'AVAX/BTC', base: 'AVAX', quote: 'BTC' });
        expect(logger.error).not.toHaveBeenCalled();
    });

    // Note: Error handling for this specific endpoint is minimal as it just returns a global variable.
    // Errors during initialization are caught by initializeTradingPairs itself, not this getter.
});
