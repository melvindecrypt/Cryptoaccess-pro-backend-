const currencyController = require('../../controllers/CurrencyController');
const Currency = require('../../models/Currency');
const { formatResponse } = require('../../utils/helpers'); // Assuming this is a pure function

// Mock external modules
jest.mock('../../models/Currency');
// If formatResponse has side effects or complex logic, you might mock it.
// For now, assuming it's a simple helper and testing its output directly through the controller.
// jest.mock('../../utils/helpers', () => ({
//     formatResponse: jest.fn((success, message, data) => ({ success, message, data })),
// }));

describe('currencyController.getAllCurrencies', () => {
    let req, res;

    beforeEach(() => {
        // Reset mocks before each test
        jest.clearAllMocks();

        // Default mock implementations for success paths
        Currency.find.mockReturnThis(); // Allows chaining .select().sort().lean()
        Currency.select.mockReturnThis();
        Currency.sort.mockReturnThis();
        Currency.lean.mockResolvedValue([
            { symbol: 'BTC', name: 'Bitcoin', logoUrl: 'btc.png' },
            { symbol: 'ETH', name: 'Ethereum', logoUrl: 'eth.png' },
        ]);

        // Mock request and response objects
        req = {}; // No request body needed for this endpoint
        res = {
            json: jest.fn(),
            status: jest.fn().mockReturnThis(), // Allow chaining .status().json()
        };

        // Spy on console.error to prevent test output and allow assertions
        jest.spyOn(console, 'error').mockImplementation(() => {});
    });

    afterEach(() => {
        // Restore console.error to its original implementation after each test
        jest.restoreAllMocks();
    });

    // --- TEST SUITE: SUCCESSFUL RETRIEVAL ---
    describe('Successful Currency Retrieval', () => {
        test('should return 200 and a list of active currencies', async () => {
            await currencyController.getAllCurrencies(req, res);

            // Assertions for Mongoose query chain
            expect(Currency.find).toHaveBeenCalledWith({ isActive: true });
            expect(Currency.select).toHaveBeenCalledWith('symbol name logoUrl');
            expect(Currency.sort).toHaveBeenCalledWith({ name: 1 });
            expect(Currency.lean).toHaveBeenCalled();

            // Assertions for response
            expect(res.json).toHaveBeenCalledWith(
                formatResponse(true, 'Currencies retrieved successfully', [
                    { symbol: 'BTC', name: 'Bitcoin', logoUrl: 'btc.png' },
                    { symbol: 'ETH', name: 'Ethereum', logoUrl: 'eth.png' },
                ])
            );
            expect(res.status).not.toHaveBeenCalled(); // Should not set status if successful
        });

        test('should return 200 and an empty array if no active currencies exist', async () => {
            Currency.lean.mockResolvedValue([]); // Mock no currencies found

            await currencyController.getAllCurrencies(req, res);

            expect(Currency.find).toHaveBeenCalledWith({ isActive: true });
            expect(res.json).toHaveBeenCalledWith(
                formatResponse(true, 'Currencies retrieved successfully', [])
            );
            expect(res.status).not.toHaveBeenCalled();
        });
    });

    // --- TEST SUITE: ERROR HANDLING ---
    describe('Error Handling', () => {
        test('should return 500 on a database error during currency fetch', async () => {
            const mockError = new Error('Database connection failed');
            Currency.lean.mockRejectedValue(mockError); // Simulate a database error

            await currencyController.getAllCurrencies(req, res);

            // Assertions for response
            expect(res.status).toHaveBeenCalledWith(500);
            expect(res.json).toHaveBeenCalledWith(
                formatResponse(false, 'Server error while fetching currencies', { error: mockError.message })
            );

            // Assertions for logging
            expect(console.error).toHaveBeenCalledWith('Error fetching currencies:', mockError);
        });

        test('should return 500 for general unexpected errors', async () => {
            const unexpectedError = new Error('Unexpected issue');
            // Simulate an error by making an early mock throw
            Currency.find.mockImplementation(() => { throw unexpectedError; });

            await currencyController.getAllCurrencies(req, res);

            expect(res.status).toHaveBeenCalledWith(500);
            expect(res.json).toHaveBeenCalledWith(
                formatResponse(false, 'Server error while fetching currencies', { error: unexpectedError.message })
            );
            expect(console.error).toHaveBeenCalledWith('Error fetching currencies:', unexpectedError);
        });
    });
});
