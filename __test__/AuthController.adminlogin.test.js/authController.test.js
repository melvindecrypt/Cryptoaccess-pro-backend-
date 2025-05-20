const authController = require('../../controllers/authController');
const User = require('../../models/User');
const Wallet = require('../../models/Wallet');
const { sendWelcomeEmail } = require('../../utils/emailService');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const mongoose = require('mongoose');
const { v4: uuidv4 } = require('uuid');

// Mock external modules
jest.mock('../../models/User');
jest.mock('../../models/Wallet');
jest.mock('../../utils/emailService');
jest.mock('bcryptjs');
jest.mock('jsonwebtoken');
jest.mock('uuid');

// Mock mongoose session and transaction capabilities
const mockSession = {
    startTransaction: jest.fn(),
    commitTransaction: jest.fn(),
    abortTransaction: jest.fn(),
    endSession: jest.fn(),
};
jest.spyOn(mongoose, 'startSession').mockResolvedValue(mockSession);

// Mock process.env.JWT_SECRET (ensure it's set for tests)
process.env.JWT_SECRET = 'test_jwt_secret'; // A dummy secret for testing

describe('authController.register', () => {
    let req, res;

    beforeEach(() => {
        // Reset mocks before each test
        jest.clearAllMocks();

        // Default mock implementations for success paths
        bcrypt.hash.mockResolvedValue('hashedPassword123');
        uuidv4.mockReturnValueOnce('new-user-uuid').mockReturnValueOnce('new-ref-code'); // For user's walletId & referralCode
        sendWelcomeEmail.mockResolvedValue(true);
        jwt.sign.mockReturnValue('mockedToken');

        // Mock User model's static methods
        User.findOne.mockResolvedValue(null); // No existing user by default
        User.mockImplementation(() => ({ // Mock User constructor and its save method
            _id: 'newUserId',
            email: 'test@example.com',
            walletId: 'WALLET-new-user-uuid',
            referralCode: 'new-ref-code',
            kycStatus: 'pending',
            referredBy: null,
            save: jest.fn().mockResolvedValue(this),
        }));

        // Mock Wallet model's static methods
        Wallet.mockImplementation(() => ({ // Mock Wallet constructor and its save method
            save: jest.fn().mockResolvedValue(true),
        }));

        // Mock request and response objects
        req = {
            body: {
                email: 'test@example.com',
                password: 'StrongPassword123!',
                referralCode: undefined, // Default to no referral
            },
        };
        res = {
            status: jest.fn().mockReturnThis(), // Allow chaining .status().json()
            json: jest.fn(),
        };
    });

    // --- TEST SUITE: VALIDATION ERRORS ---
    describe('Validation Errors', () => {
        test('should return 400 if email is missing', async () => {
            req.body.email = undefined;
            await authController.register(req, res);
            expect(res.status).toHaveBeenCalledWith(400);
            expect(res.json).toHaveBeenCalledWith({
                success: false,
                error: 'Validation Error',
                message: 'Email and password are required'
            });
            expect(mockSession.abortTransaction).toHaveBeenCalled();
            expect(mockSession.endSession).toHaveBeenCalled();
        });

        test('should return 400 if password is missing', async () => {
            req.body.password = undefined;
            await authController.register(req, res);
            expect(res.status).toHaveBeenCalledWith(400);
            expect(res.json).toHaveBeenCalledWith({
                success: false,
                error: 'Validation Error',
                message: 'Email and password are required'
            });
            expect(mockSession.abortTransaction).toHaveBeenCalled();
            expect(mockSession.endSession).toHaveBeenCalled();
        });

        test('should return 400 for invalid email format', async () => {
            req.body.email = 'invalid-email';
            await authController.register(req, res);
            expect(res.status).toHaveBeenCalledWith(400);
            expect(res.json).toHaveBeenCalledWith({
                success: false,
                error: 'Validation Error',
                message: 'Invalid email format'
            });
            expect(mockSession.abortTransaction).toHaveBeenCalled();
            expect(mockSession.endSession).toHaveBeenCalled();
        });

        test('should return 400 for password less than 12 characters', async () => {
            req.body.password = 'short1!';
            await authController.register(req, res);
            expect(res.status).toHaveBeenCalledWith(400);
            expect(res.json).toHaveBeenCalledWith({
                success: false,
                error: 'Validation Error',
                message: 'Password must be at least 12 characters with a number and uppercase letter'
            });
            expect(mockSession.abortTransaction).toHaveBeenCalled();
            expect(mockSession.endSession).toHaveBeenCalled();
        });

        test('should return 400 for password without a number', async () => {
            req.body.password = 'NoNumberPassword!';
            await authController.register(req, res);
            expect(res.status).toHaveBeenCalledWith(400);
            expect(res.json).toHaveBeenCalledWith({
                success: false,
                error: 'Validation Error',
                message: 'Password must be at least 12 characters with a number and uppercase letter'
            });
            expect(mockSession.abortTransaction).toHaveBeenCalled();
            expect(mockSession.endSession).toHaveBeenCalled();
        });

        test('should return 400 for password without an uppercase letter', async () => {
            req.body.password = 'nouppercasewith123!';
            await authController.register(req, res);
            expect(res.status).toHaveBeenCalledWith(400);
            expect(res.json).toHaveBeenCalledWith({
                success: false,
                error: 'Validation Error',
                message: 'Password must be at least 12 characters with a number and uppercase letter'
            });
            expect(mockSession.abortTransaction).toHaveBeenCalled();
            expect(mockSession.endSession).toHaveBeenCalled();
        });
    });

    // --- TEST SUITE: EXISTING USER ---
    describe('Existing User', () => {
        test('should return 409 if email is already registered', async () => {
            User.findOne.mockResolvedValue({ email: 'existing@example.com' }); // Mock existing user
            await authController.register(req, res);
            expect(res.status).toHaveBeenCalledWith(409);
            expect(res.json).toHaveBeenCalledWith({
                success: false,
                error: 'Conflict',
                message: 'Email already registered'
            });
            expect(mockSession.abortTransaction).toHaveBeenCalled();
            expect(mockSession.endSession).toHaveBeenCalled();
        });
    });

    // --- TEST SUITE: SUCCESSFUL REGISTRATION ---
    describe('Successful Registration', () => {
        test('should register a new user successfully without referral', async () => {
            await authController.register(req, res);

            // Assertions for response
            expect(res.status).toHaveBeenCalledWith(201);
            expect(res.json).toHaveBeenCalledWith(
                expect.objectContaining({
                    success: true,
                    message: 'Registration successful. Check your email to verify.',
                    token: 'mockedToken',
                    user: expect.objectContaining({
                        id: 'newUserId',
                        email: 'test@example.com',
                        walletId: expect.stringContaining('WALLET-'), // Check prefix
                        referralCode: 'new-ref-code',
                        kycStatus: 'pending'
                    }),
                    referralUsed: false
                })
            );

            // Assertions for mocks being called
            expect(mongoose.startSession).toHaveBeenCalled();
            expect(mockSession.startTransaction).toHaveBeenCalled();
            expect(User.findOne).toHaveBeenCalledWith({ email: 'test@example.com' });
            expect(bcrypt.hash).toHaveBeenCalledWith('StrongPassword123!', 12);
            expect(uuidv4).toHaveBeenCalledTimes(2); // For walletId and referralCode

            // Check User instantiation and save
            expect(User).toHaveBeenCalledWith(expect.objectContaining({
                email: 'test@example.com',
                password: 'hashedPassword123',
                walletId: expect.stringContaining('WALLET-'),
                referredBy: null,
                kycStatus: 'pending',
                referralCode: 'new-ref-code'
            }));
            // Get the instance of User created by the mock
            const userInstance = User.mock.results[0].value;
            expect(userInstance.save).toHaveBeenCalledWith({ session: mockSession });

            // Check Wallet instantiation and save
            expect(Wallet).toHaveBeenCalledWith({ userId: 'newUserId' });
            const walletInstance = Wallet.mock.results[0].value;
            expect(walletInstance.save).toHaveBeenCalledWith({ session: mockSession });

            // Check email and JWT services
            expect(sendWelcomeEmail).toHaveBeenCalledWith('test@example.com', userInstance.walletId);
            expect(jwt.sign).toHaveBeenCalledWith(
                {
                    id: 'newUserId',
                    email: 'test@example.com',
                    walletId: userInstance.walletId
                },
                'test_jwt_secret',
                { expiresIn: '24h', algorithm: 'HS256' }
            );

            // Check transaction commit and session end
            expect(mockSession.commitTransaction).toHaveBeenCalled();
            expect(mockSession.endSession).toHaveBeenCalled();
            expect(mockSession.abortTransaction).not.toHaveBeenCalled(); // Ensure no rollback
        });

        test('should register a new user successfully with a valid referral code', async () => {
            req.body.referralCode = 'EXISTING_REF';
            const referrerUser = {
                _id: 'referrerId',
                referralCode: 'EXISTING_REF',
                referredUsers: [],
                save: jest.fn().mockResolvedValue(true),
            };
            // Mock User.findOne for the referrer lookup
            User.findOne
                .mockResolvedValueOnce(null) // First call: check if new user email exists (doesn't)
                .mockResolvedValueOnce(referrerUser); // Second call: find the referrer

            // Override User mock implementation to capture the correct save calls for user and referrer
            User.mockImplementationOnce((data) => ({ // Mock for the new user
                _id: 'newUserId',
                email: data.email,
                walletId: 'WALLET-new-user-uuid',
                referralCode: 'new-ref-code',
                kycStatus: 'pending',
                referredBy: data.referredBy, // This will be set by the controller logic
                save: jest.fn().mockResolvedValue(true),
            }));


            await authController.register(req, res);

            // Assertions for response
            expect(res.status).toHaveBeenCalledWith(201);
            expect(res.json).toHaveBeenCalledWith(
                expect.objectContaining({
                    success: true,
                    referralUsed: true // Should be true now
                })
            );

            // Assertions for mocks being called
            expect(User.findOne).toHaveBeenCalledWith({ referralCode: 'EXISTING_REF' }); // Check referrer lookup
            const userInstance = User.mock.results[0].value;
            expect(userInstance.referredBy).toEqual('referrerId'); // New user's referredBy is set
            expect(userInstance.save).toHaveBeenCalledTimes(2); // Initial save and update with referredBy

            expect(referrerUser.referredUsers).toContain('newUserId'); // Referrer's referredUsers updated
            expect(referrerUser.save).toHaveBeenCalledWith({ session: mockSession }); // Referrer saved
            expect(mockSession.commitTransaction).toHaveBeenCalled();
            expect(mockSession.abortTransaction).not.toHaveBeenCalled();
        });

        test('should register a new user without referral if referral code is invalid/not found', async () => {
            req.body.referralCode = 'NON_EXISTENT_REF';
            User.findOne
                .mockResolvedValueOnce(null) // New user email not found
                .mockResolvedValueOnce(null); // Referrer not found

            await authController.register(req, res);

            // Assertions for response
            expect(res.status).toHaveBeenCalledWith(201);
            expect(res.json).toHaveBeenCalledWith(
                expect.objectContaining({
                    success: true,
                    referralUsed: false // Should be false now
                })
            );

            // Assertions for mocks being called
            expect(User.findOne).toHaveBeenCalledWith({ referralCode: 'NON_EXISTENT_REF' });
            const userInstance = User.mock.results[0].value;
            expect(userInstance.referredBy).toBeNull(); // New user's referredBy should still be null
            expect(userInstance.save).toHaveBeenCalledTimes(1); // Only initial save
            expect(mockSession.commitTransaction).toHaveBeenCalled();
            expect(mockSession.abortTransaction).not.toHaveBeenCalled();
        });
    });

    // --- TEST SUITE: ERROR HANDLING ---
    describe('Error Handling', () => {
        test('should return 500 and abort transaction if User.save fails', async () => {
            const saveError = new Error('Database save failed');
            User.mockImplementation(() => ({
                _id: 'newUserId',
                email: 'test@example.com',
                walletId: 'WALLET-new-user-uuid',
                referralCode: 'new-ref-code',
                kycStatus: 'pending',
                referredBy: null,
                save: jest.fn().mockRejectedValue(saveError), // Make save fail
            }));

            await authController.register(req, res);

            expect(res.status).toHaveBeenCalledWith(500);
            expect(res.json).toHaveBeenCalledWith({
                success: false,
                error: 'Server Error',
                message: saveError.message
            });
            expect(mockSession.abortTransaction).toHaveBeenCalled();
            expect(mockSession.endSession).toHaveBeenCalled();
            expect(mockSession.commitTransaction).not.toHaveBeenCalled();
        });

        test('should return 500 and abort transaction if Wallet.save fails', async () => {
            const walletSaveError = new Error('Wallet creation failed');
            Wallet.mockImplementation(() => ({
                save: jest.fn().mockRejectedValue(walletSaveError), // Make wallet save fail
            }));

            await authController.register(req, res);

            expect(res.status).toHaveBeenCalledWith(500);
            expect(res.json).toHaveBeenCalledWith({
                success: false,
                error: 'Registration Failed', // Specific error message for transaction catch block
                message: walletSaveError.message
            });
            expect(mockSession.abortTransaction).toHaveBeenCalled();
            expect(mockSession.endSession).toHaveBeenCalled();
            expect(mockSession.commitTransaction).not.toHaveBeenCalled();
        });

        test('should return 500 and abort transaction if sendWelcomeEmail fails', async () => {
            const emailError = new Error('Email service failed');
            sendWelcomeEmail.mockRejectedValue(emailError); // Make email service fail

            await authController.register(req, res);

            expect(res.status).toHaveBeenCalledWith(500);
            expect(res.json).toHaveBeenCalledWith({
                success: false,
                error: 'Registration Failed',
                message: emailError.message
            });
            expect(mockSession.abortTransaction).toHaveBeenCalled();
            expect(mockSession.endSession).toHaveBeenCalled();
            expect(mockSession.commitTransaction).not.toHaveBeenCalled();
        });

        test('should return 500 and abort transaction if jwt.sign fails', async () => {
            const jwtError = new Error('JWT signing failed');
            jwt.sign.mockImplementationOnce(() => { throw jwtError; }); // Make JWT sign fail

            await authController.register(req, res);

            expect(res.status).toHaveBeenCalledWith(500);
            expect(res.json).toHaveBeenCalledWith({
                success: false,
                error: 'Registration Failed',
                message: jwtError.message
            });
            expect(mockSession.abortTransaction).toHaveBeenCalled();
            expect(mockSession.endSession).toHaveBeenCalled();
            expect(mockSession.commitTransaction).not.toHaveBeenCalled();
        });

        test('should handle general unexpected errors and abort transaction', async () => {
            const unexpectedError = new Error('Something went terribly wrong');
            // Mock something early in the flow to throw, e.g., bcrypt.hash
            bcrypt.hash.mockRejectedValue(unexpectedError);

            await authController.register(req, res);

            expect(res.status).toHaveBeenCalledWith(500);
            expect(res.json).toHaveBeenCalledWith({
                success: false,
                error: 'Server Error', // This error is caught by the initial try/catch
                message: unexpectedError.message
            });
            expect(mockSession.abortTransaction).toHaveBeenCalled();
            expect(mockSession.endSession).toHaveBeenCalled();
            expect(mockSession.commitTransaction).not.toHaveBeenCalled();
        });
    });
});
