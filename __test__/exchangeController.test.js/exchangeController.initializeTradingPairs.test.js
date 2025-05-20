const ExchangeController = require('../../controllers/exchangeController'); // Import the module
const Currency = require('../../models/Currency');

// Mock external modules
jest.mock('../../models/Currency'); // Mock the Currency model
jest.mock('../../utils/logger', () => ({ // Mock logger as it's used in initializeTradingPairs
    info: jest.fn(),
    error: jest.fn(),
}));

// Mock console.log/error for the initialization process
const consoleLogSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});

// Re-import the module to ensure `initializeTradingPairs` runs after mocks are set
// This is a common pattern for testing module-level initialization
let AVAILABLE_TRADING_PAIRS_ACCESS; // A way to access the internal variable for assertions

beforeAll(async () => {
    // Mock Currency.find for the initial run
    Currency.find.mockResolvedValue([
        { symbol: 'BTC', isActive: true },
        { symbol: 'ETH', isActive: true },
        { symbol: 'USD', isActive: true }, // Ensure USD is in active currencies
    ]);

    // Force re-require the module to trigger the initialization
    // This is crucial because `initializeTradingPairs` runs when the module is first loaded
    jest.isolateModules(() => {
        const reloadedController = require('../../controllers/exchangeController');
        // If AVAILABLE_TRADING_PAIRS was exported, you'd get it here.
        // For this test, we assume we can access it through the module.
        // If not exported, you'd test its effect via getAvailableTradingPairs.
        AVAILABLE_TRADING_PAIRS_ACCESS = reloadedController.getAvailableTradingPairs.__get__('AVAILABLE_TRADING_PAIRS'); // Jest's __get__ for internal variables
    });

    // If using the above __get__ trick, you might need to adjust or rely on getAvailableTradingPairs test
    // For direct testing, `initializeTradingPairs` might need to be exported temporarily.
    // For now, let's just assert on the effect of getAvailableTradingPairs
});

afterAll(() => {
    consoleLogSpy.mockRestore();
    consoleErrorSpy.mockRestore();
});

describe('ExchangeController - initializeTradingPairs', () => {

    beforeEach(() => {
        jest.clearAllMocks(); // Clear mocks for subsequent tests if initialize was not re-run
        // If initializeTradingPairs is called globally, we clear mocks to check calls within each test
    });


    test('should initialize AVAILABLE_TRADING_PAIRS with USD base pairs and cross-pairs', async () => {
        // Since initializeTradingPairs is called globally, we test its effect via getAvailableTradingPairs
        const req = {};
        const res = { json: jest.fn(), status: jest.fn().mockReturnThis() };

        // Ensure Currency.find was called during initialization
        expect(Currency.find).toHaveBeenCalledWith({ isActive: true });
        expect(Currency.find).toHaveBeenCalledTimes(1); // Only once during module load

        // Verify the content of AVAILABLE_TRADING_PAIRS via getAvailableTradingPairs
        await ExchangeController.getAvailableTradingPairs(req, res);

        const responseData = res.json.mock.calls[0][0].data;

        // Check for expected USD base pairs
        expect(responseData).toContainEqual({ symbol: 'BTC/USD', base: 'BTC', quote: 'USD' });
        expect(responseData).toContainEqual({ symbol: 'ETH/USD', base: 'ETH', quote: 'USD' });

        // Check for some of the hardcoded cross-pairs
        expect(responseData).toContainEqual({ symbol: 'AVAX/BTC', base: 'AVAX', quote: 'BTC' });
        expect(responseData).toContainEqual({ symbol: 'SHIB/ETH', base: 'SHIB', quote: 'ETH' });
        expect(responseData).toContainEqual({ symbol: 'MANA/ETH', base: 'MANA', quote: 'ETH' });

        // Ensure no USD/USD pair
        expect(responseData).not.toContainEqual(expect.objectContaining({ symbol: 'USD/USD' }));

        expect(consoleLogSpy).toHaveBeenCalledWith('Available Trading Pairs initialized:', expect.any(Array));
        expect(consoleErrorSpy).not.toHaveBeenCalled();
    });

    test('should initialize AVAILABLE_TRADING_PAIRS with only cross-pairs if no active currencies are found', async () => {
        // Re-mock Currency.find for this specific test case before re-requiring
        jest.clearAllMocks();
        Currency.find.mockResolvedValue([]); // Simulate no active currencies

        jest.isolateModules(() => {
            const reloadedController = require('../../controllers/exchangeController');
            // Mock the response for getAvailableTradingPairs to get the updated list
            reloadedController.getAvailableTradingPairs({}, { json: jest.fn() });
        });

        const req = {};
        const res = { json: jest.fn(), status: jest.fn().mockReturnThis() };
        await ExchangeController.getAvailableTradingPairs(req, res);

        const responseData = res.json.mock.calls[0][0].data;

        // Should only contain hardcoded cross-pairs, no USD base pairs formed from active currencies
        expect(responseData).not.toContainEqual(expect.objectContaining({ symbol: 'BTC/USD' }));
        expect(responseData).not.toContainEqual(expect.objectContaining({ symbol: 'ETH/USD' }));
        expect(responseData).toContainEqual({ symbol: 'AVAX/BTC', base: 'AVAX', quote: 'BTC' }); // Still contains cross-pairs

        expect(consoleLogSpy).toHaveBeenCalledWith('Available Trading Pairs initialized:', expect.any(Array));
        expect(consoleErrorSpy).not.toHaveBeenCalled();
    });

    test('should log an error if Currency.find fails during initialization', async () => {
        const mockError = new Error('DB connection failed during initialization');
        jest.clearAllMocks();
        Currency.find.mockRejectedValue(mockError);

        jest.isolateModules(() => {
            require('../../controllers/exchangeController'); // Re-require to trigger error
        });

        expect(consoleErrorSpy).toHaveBeenCalledWith('Error initializing trading pairs:', mockError);
        // The `AVAILABLE_TRADING_PAIRS` should still contain the hardcoded values even if DB fetch fails
        const req = {};
        const res = { json: jest.fn(), status: jest.fn().mockReturnThis() };
        await ExchangeController.getAvailableTradingPairs(req, res);
        const responseData = res.json.mock.calls[0][0].data;
        expect(responseData).toContainEqual({ symbol: 'AVAX/BTC', base: 'AVAX', quote: 'BTC' });
    });
});
