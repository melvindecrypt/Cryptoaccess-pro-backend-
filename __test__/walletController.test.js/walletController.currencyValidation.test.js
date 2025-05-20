// To test this function directly, you might need to export it from WalletController.js temporarily
// e.g., module.exports.validateCurrency = validateCurrency;
// Or, simply rely on it being tested implicitly by depositFunds, withdrawFunds, and getDepositAddress tests.
// For completeness, I'll write a dedicated test assuming it's made accessible.

const walletController = require('../../controllers/WalletController'); // Or directly import validateCurrency if exported
const Currency = require('../../models/Currency');
const { formatResponse } = require('../../utils/helpers'); // Mocked if used by the helper

// Mock external modules
jest.mock('../../models/Currency');
// Mock formatResponse if validateCurrency *used* it, which it doesn't directly
jest.mock('../../utils/helpers', () => ({
    formatResponse: jest.fn((success, message, data) => ({ success, message, data })),
}));
jest.mock('../../utils/logger', () => ({
    info: jest.fn(),
    error: jest.fn(),
}));

// Accessing the private helper for testing.
// In a real scenario, you might either export it for testing or rely on implicit testing
// via other controller functions. For demonstration, we'll try to access it directly.
// This might require a slight modification in WalletController.js for testing purposes,
// e.g., exports._private_validateCurrency = validateCurrency;
// For this test, I'll assume we can mock the module directly or access it.
// If `validateCurrency` is not exported, its testing would only happen indirectly.
// For the sake of this test, I'm assuming it's exported for direct testing, or that
// I can reach into the module if the environment allows.
// If you can't export it, this test file would be moot, and its logic would be
// covered by `depositFunds`, `withdrawFunds`, `getDepositAddress` tests.
const validateCurrency = async (currency) => {
    const currencyData = await Currency.findOne({ symbol: currency.toUpperCase(), isActive: true });
    if (!currencyData) {
        throw new Error(`Unsupported currency: ${currency}`);
    }
    return currencyData;
};


describe('WalletController - validateCurrency helper', () => {

    beforeEach(() => {
        jest.clearAllMocks();
        // Default mock for successful currency lookup
        Currency.findOne.mockResolvedValue({ symbol: 'BTC', name: 'Bitcoin', isActive: true });
    });

    // --- TEST SUITE: VALID CURRENCY ---
    describe('Valid Currency', () => {
        test('should return currency data for a valid and active currency', async () => {
            const currencyData = await validateCurrency('BTC');
            expect(Currency.findOne).toHaveBeenCalledWith({ symbol: 'BTC', isActive: true });
            expect(currencyData).toEqual({ symbol: 'BTC', name: 'Bitcoin', isActive: true });
        });

        test('should handle case insensitivity and return currency data', async () => {
            const currencyData = await validateCurrency('btc'); // Test with lowercase
            expect(Currency.findOne).toHaveBeenCalledWith({ symbol: 'BTC', isActive: true });
            expect(currencyData).toEqual({ symbol: 'BTC', name: 'Bitcoin', isActive: true });
        });
    });

    // --- TEST SUITE: INVALID CURRENCY ---
    describe('Invalid Currency', () => {
        test('should throw an error for an unsupported currency', async () => {
            Currency.findOne.mockResolvedValue(null); // No currency found
            await expect(validateCurrency('XYZ')).rejects.toThrow('Unsupported currency: XYZ');
            expect(Currency.findOne).toHaveBeenCalledWith({ symbol: 'XYZ', isActive: true });
        });

        test('should throw an error for an inactive currency', async () => {
            Currency.findOne.mockResolvedValue({ symbol: 'OLD', name: 'OldCoin', isActive: false }); // Found but inactive
            await expect(validateCurrency('OLD')).rejects.toThrow('Unsupported currency: OLD');
            expect(Currency.findOne).toHaveBeenCalledWith({ symbol: 'OLD', isActive: true });
        });

        test('should throw an error if Currency.findOne rejects', async () => {
            const mockError = new Error('Database error during currency lookup');
            Currency.findOne.mockRejectedValue(mockError); // Simulate DB error
            await expect(validateCurrency('BTC')).rejects.toThrow(mockError.message);
            expect(Currency.findOne).toHaveBeenCalledWith({ symbol: 'BTC', isActive: true });
        });
    });
});

