const authController = require('../../controllers/authController');

describe('authController.logout', () => {
    let req, res;

    beforeEach(() => {
        // Mock request and response objects
        req = {
            // req.user might be set by an auth middleware, but logout should work even if it's not.
            // We'll test with it present and absent.
            user: {
                id: 'testUserId123',
                email: 'test@example.com'
            }
        };
        res = {
            status: jest.fn().mockReturnThis(), // Allow chaining .status().json()
            json: jest.fn(),
        };

        // Spy on console.log and console.error to prevent test output and allow assertions
        jest.spyOn(console, 'log').mockImplementation(() => {});
        jest.spyOn(console, 'error').mockImplementation(() => {});
    });

    afterEach(() => {
        // Restore console.log and console.error to their original implementations after each test
        jest.restoreAllMocks();
    });

    // --- TEST SUITE: SUCCESSFUL LOGOUT ---
    describe('Successful Logout', () => {
        test('should return 200 and success message when user is logged in', async () => {
            await authController.logout(req, res);

            // Assertions for response
            expect(res.status).toHaveBeenCalledWith(200);
            expect(res.json).toHaveBeenCalledWith({
                success: true,
                message: 'Logged out successfully.'
            });

            // Assertions for console.log
            expect(console.log).toHaveBeenCalledWith('User testUserId123 logged out.');
        });

        test('should return 200 and success message even if req.user is undefined (no auth middleware ran)', async () => {
            req.user = undefined; // Simulate no user object (e.g., if logout route isn't protected)

            await authController.logout(req, res);

            // Assertions for response
            expect(res.status).toHaveBeenCalledWith(200);
            expect(res.json).toHaveBeenCalledWith({
                success: true,
                message: 'Logged out successfully.'
            });

            // Assertions for console.log (should log 'User undefined logged out.')
            expect(console.log).toHaveBeenCalledWith('User undefined logged out.');
        });
    });

    // --- TEST SUITE: ERROR HANDLING ---
    describe('Error Handling', () => {
        test('should return 500 on unexpected server error', async () => {
            // Simulate an error by making res.status throw
            const mockError = new Error('Simulated unexpected error');
            res.status.mockImplementation(() => { throw mockError; });

            await authController.logout(req, res);

            // Expect the error to be caught and a 500 response sent
            // Note: because we mock res.status to throw, res.json will not be called by the controller itself.
            // Instead, the catch block's res.status/res.json will be called.
            expect(res.status).toHaveBeenCalledWith(500);
            expect(res.json).toHaveBeenCalledWith({
                success: false,
                error: 'Server Error',
                message: mockError.message
            });
            expect(console.error).toHaveBeenCalledWith('Logout error:', mockError);
        });
    });
});
