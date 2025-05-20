const authController = require('../../controllers/authController');
const Admin = require('../../models/User'); // As per your controller's import
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

// Mock external modules
jest.mock('../../models/User'); // Mock the User model which is imported as Admin
jest.mock('bcryptjs');
jest.mock('jsonwebtoken');

// Mock process.env.JWT_SECRET (ensure it's set for tests)
process.env.JWT_SECRET = 'test_admin_jwt_secret'; // A dummy secret for admin testing

describe('authController.adminLogin', () => {
    let req, res;

    beforeEach(() => {
        // Reset mocks before each test
        jest.clearAllMocks();

        // Default mock implementations for success paths
        bcrypt.compare.mockResolvedValue(true); // Assume password matches by default
        jwt.sign.mockReturnValue('mockedAdminToken');

        // Mock Admin model's findOne method
        // By default, findOne will return a mock admin user
        Admin.findOne.mockResolvedValue({
            _id: 'adminUserId123',
            email: 'admin@example.com',
            password: 'hashedAdminPassword',
            isAdmin: true,
        });

        // Mock request and response objects
        req = {
            body: {
                email: 'admin@example.com',
                password: 'adminPassword123!',
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
            await authController.adminLogin(req, res);
            expect(res.status).toHaveBeenCalledWith(400);
            expect(res.json).toHaveBeenCalledWith({
                success: false,
                message: 'Email and password are required',
            });
        });

        test('should return 400 if password is missing', async () => {
            req.body.password = undefined;
            await authController.adminLogin(req, res);
            expect(res.status).toHaveBeenCalledWith(400);
            expect(res.json).toHaveBeenCalledWith({
                success: false,
                message: 'Email and password are required',
            });
        });
    });

    // --- TEST SUITE: ADMIN NOT FOUND / NOT ADMIN ---
    describe('Admin Not Found / Not Authorized', () => {
        test('should return 404 if no admin with the email is found', async () => {
            Admin.findOne.mockResolvedValue(null); // Mock no admin found
            await authController.adminLogin(req, res);
            expect(res.status).toHaveBeenCalledWith(404);
            expect(res.json).toHaveBeenCalledWith({
                success: false,
                message: 'Admin not found',
            });
            expect(Admin.findOne).toHaveBeenCalledWith({ email: req.body.email, isAdmin: true });
        });

        test('should return 404 if user found but is not an admin (isAdmin: false)', async () => {
            Admin.findOne.mockResolvedValue({ // Mock a regular user
                _id: 'regularUserId',
                email: 'regular@example.com',
                password: 'hashedRegularPassword',
                isAdmin: false, // Key difference
            });
            req.body.email = 'regular@example.com'; // Adjust request email to match mock
            await authController.adminLogin(req, res);
            expect(res.status).toHaveBeenCalledWith(404); // Still 404 because the findOne query with isAdmin:true would return null
            expect(res.json).toHaveBeenCalledWith({
                success: false,
                message: 'Admin not found',
            });
            expect(Admin.findOne).toHaveBeenCalledWith({ email: req.body.email, isAdmin: true });
        });
    });

    // --- TEST SUITE: INVALID CREDENTIALS ---
    describe('Invalid Credentials', () => {
        test('should return 401 if password does not match', async () => {
            bcrypt.compare.mockResolvedValue(false); // Mock password mismatch
            await authController.adminLogin(req, res);
            expect(res.status).toHaveBeenCalledWith(401);
            expect(res.json).toHaveBeenCalledWith({
                success: false,
                message: 'Invalid credentials',
            });
            expect(bcrypt.compare).toHaveBeenCalledWith(req.body.password, 'hashedAdminPassword');
        });
    });

    // --- TEST SUITE: SUCCESSFUL ADMIN LOGIN ---
    describe('Successful Admin Login', () => {
        test('should log in admin successfully with valid credentials', async () => {
            await authController.adminLogin(req, res);

            // Assertions for response
            expect(res.status).toHaveBeenCalledWith(200);
            expect(res.json).toHaveBeenCalledWith({
                success: true,
                message: 'Admin login successful',
                token: 'mockedAdminToken',
            });

            // Assertions for mocks being called
            expect(Admin.findOne).toHaveBeenCalledWith({ email: 'admin@example.com', isAdmin: true });
            expect(bcrypt.compare).toHaveBeenCalledWith('adminPassword123!', 'hashedAdminPassword');
            expect(jwt.sign).toHaveBeenCalledWith(
                { id: 'adminUserId123', email: 'admin@example.com', isAdmin: true },
                'test_admin_jwt_secret',
                { expiresIn: '24h' }
            );
        });
    });

    // --- TEST SUITE: ERROR HANDLING ---
    describe('Error Handling', () => {
        test('should return 500 on server error during admin lookup', async () => {
            const findError = new Error('Database find error');
            Admin.findOne.mockRejectedValue(findError); // Mock findOne to throw an error
            await authController.adminLogin(req, res);
            expect(res.status).toHaveBeenCalledWith(500);
            expect(res.json).toHaveBeenCalledWith({
                success: false,
                message: 'Server error',
            });
            expect(console.error).toHaveBeenCalledWith(findError); // Check if error was logged
        });

        test('should return 500 on server error during password comparison', async () => {
            const compareError = new Error('Bcrypt comparison error');
            bcrypt.compare.mockRejectedValue(compareError); // Mock bcrypt.compare to throw an error
            await authController.adminLogin(req, res);
            expect(res.status).toHaveBeenCalledWith(500);
            expect(res.json).toHaveBeenCalledWith({
                success: false,
                message: 'Server error',
            });
            expect(console.error).toHaveBeenCalledWith(compareError); // Check if error was logged
        });

        test('should return 500 on server error during JWT signing', async () => {
            const jwtSignError = new Error('JWT sign error');
            jwt.sign.mockImplementation(() => { throw jwtSignError; }); // Mock jwt.sign to throw an error
            await authController.adminLogin(req, res);
            expect(res.status).toHaveBeenCalledWith(500);
            expect(res.json).toHaveBeenCalledWith({
                success: false,
                message: 'Server error',
            });
            expect(console.error).toHaveBeenCalledWith(jwtSignError); // Check if error was logged
        });
    });
});
