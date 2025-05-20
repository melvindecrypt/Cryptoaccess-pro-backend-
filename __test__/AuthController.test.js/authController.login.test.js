const authController = require('../../controllers/authController');
const User = require('../../models/User');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

// Mock external modules
jest.mock('../../models/User');
jest.mock('bcryptjs');
jest.mock('jsonwebtoken');

// Mock process.env.JWT_SECRET (ensure it's set for tests)
process.env.JWT_SECRET = 'test_user_jwt_secret'; // A dummy secret for user login testing

describe('authController.login', () => {
    let req, res;

    beforeEach(() => {
        // Reset mocks before each test
        jest.clearAllMocks();

        // Default mock implementations for success paths
        bcrypt.compare.mockResolvedValue(true); // Assume password matches by default
        jwt.sign.mockReturnValue('mockedUserToken');

        // Mock User model's findOne method
        // By default, findOne will return a mock user
        User.findOne.mockResolvedValue({
            _id: 'user123',
            email: 'user@example.com',
            password: 'hashedUserPassword',
            walletId: 'WALLET-abc',
            kycStatus: 'approved',
            isSuspended: false, // Not suspended by default
        });

        // Mock request and response objects
        req = {
            body: {
                email: 'user@example.com',
                password: 'userPassword123!',
            },
        };
        res = {
            status: jest.fn().mockReturnThis(), // Allow chaining .status().json()
            json: jest.fn(),
        };

        // Spy on console.error to prevent test output and allow assertions
        jest.spyOn(console, 'error').mockImplementation(() => {});
    });

    afterEach(() => {
        // Restore console.error to its original implementation after each test
        jest.restoreAllMocks();
    });

    // --- TEST SUITE: VALIDATION ERRORS ---
    describe('Validation Errors', () => {
        test('should return 400 if email is missing', async () => {
            req.body.email = undefined;
            await authController.login(req, res);
            expect(res.status).toHaveBeenCalledWith(400);
            expect(res.json).toHaveBeenCalledWith({
                success: false,
                error: 'Validation Error',
                message: 'Email and password are required',
            });
        });

        test('should return 400 if password is missing', async () => {
            req.body.password = undefined;
            await authController.login(req, res);
            expect(res.status).toHaveBeenCalledWith(400);
            expect(res.json).toHaveBeenCalledWith({
                success: false,
                error: 'Validation Error',
                message: 'Email and password are required',
            });
        });
    });

    // --- TEST SUITE: USER NOT FOUND / AUTHENTICATION FAILED ---
    describe('User Not Found / Authentication Failed', () => {
        test('should return 401 if user with email is not found', async () => {
            User.findOne.mockResolvedValue(null); // Mock no user found
            await authController.login(req, res);
            expect(res.status).toHaveBeenCalledWith(401);
            expect(res.json).toHaveBeenCalledWith({
                success: false,
                error: 'Authentication Failed',
                message: 'Invalid credentials',
            });
            expect(User.findOne).toHaveBeenCalledWith({ email: req.body.email });
        });

        test('should return 401 if password does not match', async () => {
            bcrypt.compare.mockResolvedValue(false); // Mock password mismatch
            await authController.login(req, res);
            expect(res.status).toHaveBeenCalledWith(401);
            expect(res.json).toHaveBeenCalledWith({
                success: false,
                error: 'Authentication Failed',
                message: 'Invalid credentials',
            });
            expect(bcrypt.compare).toHaveBeenCalledWith(req.body.password, 'hashedUserPassword');
        });
    });

    // --- TEST SUITE: ACCOUNT SUSPENSION ---
    describe('Account Suspension', () => {
        test('should return 403 if user account is suspended', async () => {
            User.findOne.mockResolvedValue({
                _id: 'suspendedUser123',
                email: 'suspended@example.com',
                password: 'hashedSuspendedPassword',
                walletId: 'WALLET-xyz',
                kycStatus: 'approved',
                isSuspended: true, // Mock suspended account
            });
            req.body.email = 'suspended@example.com';
            await authController.login(req, res);
            expect(res.status).toHaveBeenCalledWith(403);
            expect(res.json).toHaveBeenCalledWith({
                success: false,
                error: 'Forbidden',
                message: 'Account suspended',
            });
            // Ensure compare is still called even for suspended user (as it's checked after password match)
            expect(bcrypt.compare).toHaveBeenCalledWith(req.body.password, 'hashedSuspendedPassword');
        });
    });

    // --- TEST SUITE: SUCCESSFUL USER LOGIN ---
    describe('Successful User Login', () => {
        test('should log in user successfully with valid credentials', async () => {
            await authController.login(req, res);

            // Assertions for response
            expect(res.status).toHaveBeenCalledWith(200);
            expect(res.json).toHaveBeenCalledWith({
                success: true,
                message: 'Login successful',
                token: 'mockedUserToken',
                user: {
                    id: 'user123',
                    email: 'user@example.com',
                    walletId: 'WALLET-abc',
                    kycStatus: 'approved',
                },
            });

            // Assertions for mocks being called
            expect(User.findOne).toHaveBeenCalledWith({ email: 'user@example.com' });
            expect(bcrypt.compare).toHaveBeenCalledWith('userPassword123!', 'hashedUserPassword');
            expect(jwt.sign).toHaveBeenCalledWith(
                {
                    id: 'user123',
                    email: 'user@example.com',
                    walletId: 'WALLET-abc',
                    kycStatus: 'approved',
                },
                'test_user_jwt_secret',
                { expiresIn: '24h' }
            );
        });
    });

    // --- TEST SUITE: ERROR HANDLING ---
    describe('Error Handling', () => {
        test('should return 500 on server error during user lookup', async () => {
            const findError = new Error('Database find error');
            User.findOne.mockRejectedValue(findError); // Mock findOne to throw an error
            await authController.login(req, res);
            expect(res.status).toHaveBeenCalledWith(500);
            expect(res.json).toHaveBeenCalledWith({
                success: false,
                error: 'Server Error',
                message: findError.message,
            });
            expect(console.error).toHaveBeenCalledWith('Login error:', findError); // Check if error was logged
        });

        test('should return 500 on server error during password comparison', async () => {
            const compareError = new Error('Bcrypt comparison error');
            bcrypt.compare.mockRejectedValue(compareError); // Mock bcrypt.compare to throw an error
            await authController.login(req, res);
            expect(res.status).toHaveBeenCalledWith(500);
            expect(res.json).toHaveBeenCalledWith({
                success: false,
                error: 'Server Error',
                message: compareError.message,
            });
            expect(console.error).toHaveBeenCalledWith('Login error:', compareError); // Check if error was logged
        });

        test('should return 500 on server error during JWT signing', async () => {
            const jwtSignError = new Error('JWT sign error');
            jwt.sign.mockImplementation(() => { throw jwtSignError; }); // Mock jwt.sign to throw an error
            await authController.login(req, res);
            expect(res.status).toHaveBeenCalledWith(500);
            expect(res.json).toHaveBeenCalledWith({
                success: false,
                error: 'Server Error',
                message: jwtSignError.message,
            });
            expect(console.error).toHaveBeenCalledWith('Login error:', jwtSignError); // Check if error was logged
        });
    });
});
