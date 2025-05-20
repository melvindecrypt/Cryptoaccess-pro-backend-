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
beforeAll(async () => {
    Currency.find.mockResolvedValue([
        { symbol: 'BTC', isActive: true },
        { symbol: 'ETH', isActive: true },
        { symbol: 'USD', isActive: true },
    ]);
    jest.isolateModules(() => {
        require('../../controllers/exchangeController'); // Triggers initialization
    });
});

afterAll(() => {
    jest.restoreAllMocks(); // Restore console after all tests
});

describe('exchangeController.getExchangePairs', () => {
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
        await exchangeController.getExchangePairs(req, res);

        expect(res.status).not.toHaveBeenCalled(); // Default 200 OK
        expect(res.json).toHaveBeenCalledWith(
            formatResponse(true, 'Available trading pairs retrieved successfully', expect.any(Array))
        );

        const responseData = res.json.mock.calls[0][0].data;
        // Assert that the array is not empty and contains expected elements
        expect(responseData.length).toBeGreaterThan(0);
        expect(responseData).toContainEqual({ symbol: 'BTC/USD', base: 'BTC', quote: 'USD' });
        expect(responseData).toContainEqual({ symbol: 'AVAX/BTC', base: 'AVAX', quote: 'BTC' });
        expect(logger.error).not.toHaveBeenCalled();
    });

    test('should return 500 if an unexpected error occurs', async () => {
        const mockError = new Error('Unexpected error during pair fetch');
        // Temporarily make formatResponse throw an error to simulate unexpected failure
        formatResponse.mockImplementationOnce(() => { throw mockError; });

        await exchangeController.getExchangePairs(req, res);

        expect(res.status).toHaveBeenCalledWith(500);
        expect(res.json).toHaveBeenCalledWith(formatResponse(false, 'Server error while fetching exchange pairs'));
        expect(logger.error).toHaveBeenCalledWith(`Error fetching exchange pairs: ${mockError.message}`);
    });
});
