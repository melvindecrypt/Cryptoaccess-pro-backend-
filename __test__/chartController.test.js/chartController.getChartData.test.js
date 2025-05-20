const chartController = require('../../controllers/chartController');
const axios = require('axios');

// Mock external modules
jest.mock('axios'); // Mock the entire axios module

describe('chartController.getChartData', () => {
    let req, res;

    beforeEach(() => {
        jest.clearAllMocks(); // Clear mocks before each test

        // Mock response for axios.get
        axios.get.mockResolvedValue({
            data: {
                prices: [
                    [1678886400000, 20000.00], // March 15, 2023, 00:00:00 GMT
                    [1678972800000, 20500.50], // March 16, 2023, 00:00:00 GMT
                    [1679059200000, 21000.75], // March 17, 2023, 00:00:00 GMT
                ]
            }
        });

        // Mock request and response objects
        req = {
            query: {
                coin: 'BTC'
            }
        };
        res = {
            json: jest.fn(),
            status: jest.fn().mockReturnThis(), // Allows chaining .status().json()
        };

        // Suppress console.error output from original code's try-catch in tests
        jest.spyOn(console, 'error').mockImplementation(() => {});
    });

    afterEach(() => {
        jest.restoreAllMocks(); // Restore console.error after each test
    });

    // --- TEST SUITE: VALIDATION ---
    describe('Validation', () => {
        test('should return 400 if coin parameter is missing', async () => {
            req.query.coin = undefined; // Remove coin parameter

            await chartController.getChartData(req, res);

            expect(res.status).toHaveBeenCalledWith(400);
            expect(res.json).toHaveBeenCalledWith({ success: false, message: 'Coin parameter is required' });
            expect(axios.get).not.toHaveBeenCalled(); // axios should not be called
            expect(console.error).not.toHaveBeenCalled(); // No error logged for this validation
        });
    });

    // --- TEST SUITE: SUCCESSFUL RETRIEVAL ---
    describe('Successful Chart Data Retrieval', () => {
        test('should fetch chart data and format it correctly', async () => {
            await chartController.getChartData(req, res);

            // Assertions for axios call
            const expectedCoinId = req.query.coin.toLowerCase();
            const expectedApiUrl = `https://api.coingecko.com/api/v3/coins/${expectedCoinId}/market_chart?vs_currency=usd&days=30`;
            expect(axios.get).toHaveBeenCalledWith(expectedApiUrl);

            // Assertions for response
            expect(res.status).not.toHaveBeenCalled(); // Default 200 OK
            expect(res.json).toHaveBeenCalledWith({
                coin: 'BTC',
                data: [
                    { timestamp: new Date(1678886400000).toISOString(), price: 20000.00 },
                    { timestamp: new Date(1678972800000).toISOString(), price: 20500.50 },
                    { timestamp: new Date(1679059200000).toISOString(), price: 21000.75 },
                ],
            });
            expect(console.error).not.toHaveBeenCalled();
        });

        test('should handle different casing for coin parameter', async () => {
            req.query.coin = 'btc'; // Lowercase input
            await chartController.getChartData(req, res);
            expect(axios.get).toHaveBeenCalledWith(expect.stringContaining('/coins/btc/'));
            expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ coin: 'BTC' })); // Output should be uppercase
        });

        test('should return empty data array if CoinGecko returns empty prices', async () => {
            axios.get.mockResolvedValue({ data: { prices: [] } });

            await chartController.getChartData(req, res);

            expect(res.json).toHaveBeenCalledWith({ coin: 'BTC', data: [] });
        });

        test('should return empty data array if CoinGecko response lacks prices property', async () => {
            axios.get.mockResolvedValue({ data: {} }); // Missing 'prices' property

            await chartController.getChartData(req, res);

            expect(res.json).toHaveBeenCalledWith({ coin: 'BTC', data: [] });
        });
    });

    // --- TEST SUITE: ERROR HANDLING ---
    describe('Error Handling', () => {
        test('should return 404 if CoinGecko API returns 404 (coin not found)', async () => {
            const mockError = { response: { status: 404, data: { error: 'coin not found' } } };
            axios.get.mockRejectedValue(mockError);

            await chartController.getChartData(req, res);

            expect(res.status).toHaveBeenCalledWith(404);
            expect(res.json).toHaveBeenCalledWith({ success: false, message: `Chart data not found for ${req.query.coin}` });
            expect(console.error).toHaveBeenCalledWith(
                `Error fetching chart data for ${req.query.coin}:`,
                mockError
            );
        });

        test('should return 500 for other CoinGecko API errors (non-404)', async () => {
            const mockError = { response: { status: 500, data: 'API internal error' } };
            axios.get.mockRejectedValue(mockError);

            await chartController.getChartData(req, res);

            expect(res.status).toHaveBeenCalledWith(500);
            expect(res.json).toHaveBeenCalledWith({
                success: false,
                message: 'Server error fetching chart data',
                error: expect.any(String), // The error.message from the mock error
            });
            expect(console.error).toHaveBeenCalledWith(
                `Error fetching chart data for ${req.query.coin}:`,
                mockError
            );
        });

        test('should return 500 for general unexpected errors', async () => {
            const unexpectedError = new Error('Network timeout');
            axios.get.mockRejectedValue(unexpectedError);

            await chartController.getChartData(req, res);

            expect(res.status).toHaveBeenCalledWith(500);
            expect(res.json).toHaveBeenCalledWith({
                success: false,
                message: 'Server error fetching chart data',
                error: unexpectedError.message,
            });
            expect(console.error).toHaveBeenCalledWith(
                `Error fetching chart data for ${req.query.coin}:`,
                unexpectedError
            );
        });
    });
});
