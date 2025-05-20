const walletController = require('../../controllers/WalletController');
const Currency = require('../../models/Currency'); // For validateCurrency
const { formatResponse } = require('../../utils/helpers');
const logger = require('../../utils/logger'); // Used for error logging in other parts, good to mock

// Mock external modules
jest.mock('../../models/Currency');
jest.mock('../../utils/helpers', () => ({
    formatResponse: jest.fn((success, message, data) => ({ success, message, data })),
}));
jest.mock('../../utils/logger', () => ({
    info: jest.fn(),
    error: jest.fn(),
}));

describe('walletController.getDepositAddress', () => {
    let req, res;
    const REAL_WALLET_ADDRESSES = {
        BTC: "bc1qrhmqgnwml62udh5c5wnyukx65rdtqdsa58p54l",
        ETH: "0xEe19FeE35ef7257c5Bcd8a1206dB6b1fCdf8e767",
    };

    beforeEach(() => {
        jest.clearAllMocks();

        // Mock Currency.findOne for validateCurrency
        Currency.findOne.mockResolvedValue({ symbol: 'BTC', isActive: true });

        // Mock request and response objects
        req = {
            query: {
                currency: 'BTC',
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

    // --- TEST SUITE: SUCCESSFUL RETRIEVAL ---
    describe('Successful Deposit Address Retrieval', () => {
        test('should return 200 and deposit address for a valid currency', async () => {
            await walletController.getDepositAddress(req, res);

            // Assertions for validateCurrency (internal call)
            expect(Currency.findOne).toHaveBeenCalledWith({ symbol: 'BTC', isActive: true });

            // Assertions for response
            expect(res.status).not.toHaveBeenCalled(); // Default 200
            expect(res.json).toHaveBeenCalledWith(
                formatResponse(true, 'Deposit address retrieved', {
                    currency: 'BTC',
                    address: REAL_WALLET_ADDRESSES.BTC,
                    memo: 'Use this address for deposits only',
                    qrCode: `https://api.qrserver.com/v1/create-qr-code/?size=150x150&data=${REAL_WALLET_ADDRESSES.BTC}`
                })
            );
            expect(logger.error).not.toHaveBeenCalled();
        });

        test('should return correct address for another valid currency (ETH)', async () => {
            req.query.currency = 'ETH';
            Currency.findOne.mockResolvedValue({ symbol: 'ETH', isActive: true }); // Mock for ETH

            await walletController.getDepositAddress(req, res);

            expect(res.json).toHaveBeenCalledWith(
                formatResponse(true, 'Deposit address retrieved', {
                    currency: 'ETH',
                    address: REAL_WALLET_ADDRESSES.ETH,
                    memo: 'Use this address for deposits only',
                    qrCode: `https://api.qrserver.com/v1/create-qr-code/?size=150x150&data=${REAL_WALLET_ADDRESSES.ETH}`
                })
            );
        });
    });

    // --- TEST SUITE: ERROR HANDLING ---
    describe('Error Handling', () => {
        test('should return 400 if currency is unsupported', async () => {
            req.query.currency = 'UNSUPPORTED';
            Currency.findOne.mockResolvedValue(null); // Simulate validateCurrency throwing error

            await walletController.getDepositAddress(req, res);

            expect(res.status).toHaveBeenCalledWith(400);
            expect(res.json).toHaveBeenCalledWith(formatResponse(false, 'Unsupported currency: UNSUPPORTED'));
            expect(logger.error).not.toHaveBeenCalled(); // No specific logger.error in this catch block
        });

        test('should return 400 if Currency.findOne throws an error', async () => {
            const dbError = new Error('DB lookup error');
            Currency.findOne.mockRejectedValue(dbError);

            await walletController.getDepositAddress(req, res);

            expect(res.status).toHaveBeenCalledWith(400);
            expect(res.json).toHaveBeenCalledWith(formatResponse(false, dbError.message));
            expect(logger.error).not.toHaveBeenCalled(); // No specific logger.error in this catch block
        });
    });
});
