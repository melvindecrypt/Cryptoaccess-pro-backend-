const request = require('supertest');
const mongoose = require('mongoose');
const { MongoMemoryServer } = require('mongodb-memory-server');
const app = require('../app'); // Assuming your app.js exports the Express app
const User = require('../models/User');
const { formatResponse } = require('../utils/helpers');
const logger = require('../utils/logger');
const AuditService = require('../services/auditService');
const emailService = require('../services/emailService');
const path = require('path'); // For path.join

// Mock external dependencies
jest.mock('../utils/logger');
jest.mock('../utils/helpers', () => ({
    formatResponse: jest.fn((success, message, data) => ({ success, message, data })),
}));
jest.mock('../services/auditService');
jest.mock('../services/emailService');

let mongoServer;
let uri;

// Dummy data for testing
let testUser, adminUser;

// Setup before all tests
beforeAll(async () => {
    mongoServer = await MongoMemoryServer.create();
    uri = mongoServer.getUri();
    await mongoose.connect(uri, {
        useNewUrlParser: true,
        useUnifiedTopology: true,
    });

    testUser = await User.create({
        firstName: 'Jane',
        lastName: 'Doe',
        email: 'jane.doe@example.com',
        password: 'password123',
        isEmailVerified: true,
        kycStatus: 'pending', // Initial status for tests
        kycDocuments: []
    });

    adminUser = await User.create({
        firstName: 'Admin',
        lastName: 'User',
        email: 'admin@example.com',
        password: 'adminpassword',
        role: 'admin', // Assuming a role field
    });

    // Mock authentication middleware. For simplicity, we'll manually set req.user for tests.
    // In a real app, you'd integrate with your actual auth middleware.
    app.use((req, res, next) => {
        // This is a very simplified mock. For real testing, you'd test middleware separately.
        // For these controller tests, we'll directly set req.user in test cases.
        next();
    });
});

// Cleanup after all tests
afterAll(async () => {
    await mongoose.disconnect();
    await mongoServer.stop();
});

// Clear data after each test to ensure isolation
afterEach(async () => {
    // Reset user's KYC status and documents for clean slate
    await User.updateOne({ _id: testUser._id }, {
        $set: {
            kycStatus: 'pending',
            kycDocuments: []
        }
    });
    jest.clearAllMocks(); // Clear mock call history after each test
});

describe('KycController', () => {

    describe('submitKYC', () => {
        // Helper to simulate a user being authenticated
        const withAuth = (req, res, next) => {
            req.user = testUser;
            next();
        };

        // Inject the mock middleware for this describe block
        // NOTE: This assumes your app exports the express router, and you can inject middleware this way.
        // If app.js exports the whole app, you might need to mock the entire auth middleware.
        // For supertest, you often just ensure your tests are run with a user attached if the endpoint is protected.
        // Let's assume for `submitKYC` route is configured like: `router.post('/submit', authenticateToken, kycController.submitKYC);`
        // We will directly set req.user in the test context.
        let agent;
        beforeEach(() => {
            agent = request.agent(app); // Create a Supertest agent to maintain state (like cookies/sessions)
            // Manually attach user to the agent's request for authenticated routes
            agent.post = jest.fn((...args) => {
                const req = args[args.length - 1]; // Assume last arg is options object that might contain req
                if (req) {
                    req.user = testUser; // Directly set req.user for the request
                }
                return request(app).post(...args);
            });
            agent.put = jest.fn((...args) => {
                const req = args[args.length - 1];
                if (req) {
                    req.user = adminUser; // Admin for updates
                }
                return request(app).put(...args);
            });
            // Reset agent for each test if necessary
            jest.spyOn(request, 'agent').mockReturnValue(agent);
        });
        afterEach(() => {
            jest.restoreAllMocks(); // Restore mocks after each test
        });


        test('should successfully submit KYC documents', async () => {
            // Use supertest's .attach() for file uploads
            const res = await request(app)
                .post('/api/kyc/submit') // Adjust API path
                .set('Authorization', `Bearer some-token-for-user`) // Mock auth token
                .set('Cookie', [`connect.sid=s%3A${testUser._id}`]) // Example for session
                .field('docType', 'PASSPORT')
                .attach('idFront', path.join(__dirname, 'mock-files', 'passport_front.png')) // Use a mock file
                .attach('idBack', path.join(__dirname, 'mock-files', 'passport_back.png'))
                .attach('selfie', path.join(__dirname, 'mock-files', 'selfie.png'));

            expect(res.statusCode).toEqual(200);
            expect(formatResponse).toHaveBeenCalledWith(true, 'KYC documents submitted for review', expect.any(Object));
            expect(AuditService.log).toHaveBeenCalledWith('kyc_submission', expect.any(Object));
            expect(emailService.sendKYCNotification).toHaveBeenCalledWith({
                userEmail: testUser.email,
                userId: testUser._id.toString(),
                adminEmail: process.env.ADMIN_EMAIL // Ensure this env variable is set for tests if needed
            });
            expect(logger.info).toHaveBeenCalledWith(expect.stringContaining(`KYC submission completed for user ${testUser.email}`), expect.any(Object));

            // Verify user's KYC status and documents updated in DB
            const updatedUser = await User.findById(testUser._id);
            expect(updatedUser.kycStatus).toEqual('pending');
            expect(updatedUser.kycDocuments.length).toEqual(1);
            expect(updatedUser.kycDocuments[0].docType).toEqual('PASSPORT');
            expect(updatedUser.kycDocuments[0].status).toEqual('pending');
            expect(updatedUser.kycDocuments[0].frontFileUrl).toBeDefined();
            expect(updatedUser.kycDocuments[0].backFileUrl).toBeDefined();
            expect(updatedUser.kycDocuments[0].selfieFileUrl).toBeDefined();
        });

        test('should return 400 if selfie is missing', async () => {
            const res = await request(app)
                .post('/api/kyc/submit')
                .set('Authorization', `Bearer some-token-for-user`)
                .set('Cookie', [`connect.sid=s%3A${testUser._id}`])
                .field('docType', 'NATIONAL_ID')
                .attach('idFront', path.join(__dirname, 'mock-files', 'id_front.png')); // No selfie

            expect(res.statusCode).toEqual(400);
            expect(formatResponse).toHaveBeenCalledWith(false, 'Selfie image is required.', expect.any(Object));
            expect(AuditService.log).not.toHaveBeenCalled();
            expect(emailService.sendKYCNotification).not.toHaveBeenCalled();
            expect(logger.error).toHaveBeenCalledWith(expect.stringContaining('KYC submission failed for user'), expect.any(Object));
        });

        test('should return 500 for server error during submission', async () => {
            // Mock User.findById to throw an error
            jest.spyOn(User, 'findById').mockImplementationOnce(() => {
                throw new Error('Database error during user fetch');
            });

            const res = await request(app)
                .post('/api/kyc/submit')
                .set('Authorization', `Bearer some-token-for-user`)
                .set('Cookie', [`connect.sid=s%3A${testUser._id}`])
                .field('docType', 'PASSPORT')
                .attach('selfie', path.join(__dirname, 'mock-files', 'selfie.png'));

            expect(res.statusCode).toEqual(500);
            expect(formatResponse).toHaveBeenCalledWith(false, 'KYC submission failed', expect.any(Object));
            expect(logger.error).toHaveBeenCalledWith(expect.stringContaining('KYC submission failed for user'), expect.any(Object));
        });
    });

    // NOTE: The KycController has two `exports.updateKYCStatus`. We are testing the second, more robust one.
    // Ensure the first one is removed from your actual controller.
    describe('updateKYCStatus (Individual Document & Overall Status Update)', () => {
        let submittedKycDocument;

        beforeEach(async () => {
            // First, submit a KYC document for the testUser to be updated
            await User.updateOne({ _id: testUser._id }, {
                $push: {
                    kycDocuments: {
                        docType: 'PASSPORT',
                        frontFileUrl: 'passport_front.png',
                        backFileUrl: 'passport_back.png',
                        selfieFileUrl: 'selfie.png',
                        status: 'pending',
                        frontStatus: 'pending',
                        backStatus: 'pending',
                        uploadedAt: new Date()
                    }
                },
                $set: { kycStatus: 'pending' }
            });

            const updatedUser = await User.findById(testUser._id);
            submittedKycDocument = updatedUser.kycDocuments[0];

            // Mock authentication middleware for admin actions
            // In a real app, this would be handled by your auth middleware
            app.use((req, res, next) => {
                req.user = adminUser; // Set req.user to admin for these tests
                next();
            });
        });

        test('should approve individual document parts and overall status', async () => {
            const res = await request(app)
                .put('/api/kyc/status') // Adjust API path
                .send({
                    userId: testUser._id.toString(),
                    docType: 'PASSPORT',
                    frontStatus: 'verified',
                    backStatus: 'verified',
                    status: 'verified', // Overall document status
                });

            expect(res.statusCode).toEqual(200);
            expect(formatResponse).toHaveBeenCalledWith(true, 'KYC status updated for PASSPORT', expect.any(Object));
            expect(AuditService.log).toHaveBeenCalledWith('kyc_document_status_change', expect.any(Object));
            expect(emailService.sendKYCApproval).toHaveBeenCalledWith(testUser.email); // Overall user status changed to approved

            const updatedUser = await User.findById(testUser._id);
            expect(updatedUser.kycStatus).toEqual('approved');
            expect(updatedUser.kycDocuments[0].status).toEqual('verified');
            expect(updatedUser.kycDocuments[0].frontStatus).toEqual('verified');
            expect(updatedUser.kycDocuments[0].backStatus).toEqual('verified');
            expect(updatedUser.kycDocuments[0].reviewedAt).toBeInstanceOf(Date);
            expect(updatedUser.kycDocuments[0].reviewedBy.toString()).toEqual(adminUser._id.toString());
        });

        test('should reject individual document part and update overall user status to rejected', async () => {
            const res = await request(app)
                .put('/api/kyc/status')
                .send({
                    userId: testUser._id.toString(),
                    docType: 'PASSPORT',
                    frontStatus: 'rejected',
                    reason: 'Poor quality image',
                });

            expect(res.statusCode).toEqual(200);
            expect(formatResponse).toHaveBeenCalledWith(true, 'KYC status updated for PASSPORT', expect.any(Object));
            expect(AuditService.log).toHaveBeenCalledWith('kyc_document_status_change', expect.any(Object));
            expect(emailService.sendKYCRejection).toHaveBeenCalledWith(testUser.email, 'Poor quality image');

            const updatedUser = await User.findById(testUser._id);
            expect(updatedUser.kycStatus).toEqual('rejected');
            expect(updatedUser.kycDocuments[0].frontStatus).toEqual('rejected');
            expect(updatedUser.kycDocuments[0].status).toEqual('rejected'); // Overall doc status should be rejected if any part is
            expect(updatedUser.kycDocuments[0].reason).toEqual('Poor quality image');
        });

        test('should return 400 for missing userId, docType, or any status update', async () => {
            const res = await request(app)
                .put('/api/kyc/status')
                .send({}); // Empty body

            expect(res.statusCode).toEqual(400);
            expect(formatResponse).toHaveBeenCalledWith(false, 'Invalid input: userId, docType, and at least one status (frontStatus, backStatus, or status) are required.', expect.any(Object));
            expect(logger.error).toHaveBeenCalledWith(expect.stringContaining('Validation failed: Missing required fields for KYC document update'), expect.any(Object));
        });

        test('should return 400 for invalid status value', async () => {
            const res = await request(app)
                .put('/api/kyc/status')
                .send({
                    userId: testUser._id.toString(),
                    docType: 'PASSPORT',
                    frontStatus: 'invalidStatus',
                });

            expect(res.statusCode).toEqual(400);
            expect(formatResponse).toHaveBeenCalledWith(false, 'Invalid value for frontStatus. Use: pending, verified, rejected', expect.any(Object));
        });

        test('should return 400 for missing rejection reason when status is rejected', async () => {
            const res = await request(app)
                .put('/api/kyc/status')
                .send({
                    userId: testUser._id.toString(),
                    docType: 'PASSPORT',
                    status: 'rejected',
                    // No reason provided
                });

            expect(res.statusCode).toEqual(400);
            expect(formatResponse).toHaveBeenCalledWith(false, 'Rejection reason is required when setting a status to "rejected".', expect.any(Object));
        });

        test('should return 404 if user not found', async () => {
            const nonExistentUserId = new mongoose.Types.ObjectId();
            const res = await request(app)
                .put('/api/kyc/status')
                .send({
                    userId: nonExistentUserId.toString(),
                    docType: 'PASSPORT',
                    status: 'verified',
                });

            expect(res.statusCode).toEqual(404);
            expect(formatResponse).toHaveBeenCalledWith(false, 'User not found.', expect.any(Object));
        });

        test('should return 404 if KYC document not found for user', async () => {
            const res = await request(app)
                .put('/api/kyc/status')
                .send({
                    userId: testUser._id.toString(),
                    docType: 'DRIVERS_LICENSE', // User only has PASSPORT
                    status: 'verified',
                });

            expect(res.statusCode).toEqual(404);
            expect(formatResponse).toHaveBeenCalledWith(false, 'KYC document of type DRIVERS_LICENSE not found for this user.', expect.any(Object));
        });

        test('should handle server error during update', async () => {
            // Mock User.findById to throw an error
            jest.spyOn(User, 'findById').mockImplementationOnce(() => {
                throw new Error('Database error during update');
            });

            const res = await request(app)
                .put('/api/kyc/status')
                .send({
                    userId: testUser._id.toString(),
                    docType: 'PASSPORT',
                    status: 'verified',
                });

            expect(res.statusCode).toEqual(500);
            expect(formatResponse).toHaveBeenCalledWith(false, 'Failed to update KYC status', expect.any(Object));
            expect(logger.error).toHaveBeenCalledWith(expect.stringContaining('KYC document status update failed: Database error during update'), expect.any(Object));
        });

        test('should not send approval email if user kycStatus was already approved', async () => {
            // Set user's overall kycStatus to approved before test
            await User.updateOne({ _id: testUser._id }, { $set: { kycStatus: 'approved' } });

            const res = await request(app)
                .put('/api/kyc/status')
                .send({
                    userId: testUser._id.toString(),
                    docType: 'PASSPORT',
                    frontStatus: 'verified',
                    backStatus: 'verified',
                    status: 'verified',
                });

            expect(res.statusCode).toEqual(200);
            expect(emailService.sendKYCApproval).not.toHaveBeenCalled(); // Should not be called again
        });

        test('should not send rejection email if user kycStatus was already rejected', async () => {
            // Set user's overall kycStatus to rejected before test
            await User.updateOne({ _id: testUser._id }, { $set: { kycStatus: 'rejected' } });

            const res = await request(app)
                .put('/api/kyc/status')
                .send({
                    userId: testUser._id.toString(),
                    docType: 'PASSPORT',
                    frontStatus: 'rejected',
                    reason: 'Previous rejection',
                });

            expect(res.statusCode).toEqual(200);
            expect(emailService.sendKYCRejection).not.toHaveBeenCalled(); // Should not be called again
        });
    });
});
