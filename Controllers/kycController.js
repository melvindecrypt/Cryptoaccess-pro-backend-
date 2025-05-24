const User = require('../models/user');
const { formatResponse } = require('../utils/helpers');
const logger = require('../utils/logger');
const AuditService = require('../services/auditService');
const emailService = require('../services/emailService');

exports.submitKYC = async (req, res) => {
  const { docType } = req.body;
  const { idFront, idBack, selfie } = req.files;
  const userId = req.user._id;
  const userEmail = req.user.email;

  try {
    logger.info(`KYC submission initiated for user ${userEmail}`, {
      userId,
      action: 'kyc_submission_start',
      metadata: {
        fileCount: Object.keys(req.files).length,
        docType
      }
    });

    const user = await User.findById(userId);
    if (!user) {
      throw new Error('User not found');
    }

    // Check if selfie is uploaded
    if (!selfie || selfie.length === 0) {
      return res.status(400).json(formatResponse(false, 'Selfie image is required.'));
    }

    const newKycDocument = {
      docType: docType.toUpperCase(), // Ensure consistency with the enum
      frontFileUrl: idFront ? idFront[0].filename : null,
      backFileUrl: idBack ? idBack[0].filename : null,
      selfieFileUrl: selfie[0].filename, // Store selfie filename
      status: 'pending',
      uploadedAt: new Date()
    };

    // Add the new document to the kycDocuments array
    user.kycDocuments.push(newKycDocument);
    user.kycStatus = 'pending'; // Update KYC status to pending

    await user.save();

    await AuditService.log('kyc_submission', {
      userId,
      entityType: 'User',
      entityId: userId,
      metadata: {
        documents: user.kycDocuments.map(doc => ({
          type: doc.docType,
          front: !!doc.frontFileUrl,
          back: !!doc.backFileUrl,
          selfie: !!doc.selfieFileUrl
        })),
        docType
      }
    });

    await emailService.sendKYCNotification({
      userEmail,
      userId,
      adminEmail: process.env.ADMIN_EMAIL
    });

    logger.info(`KYC submission completed for user ${userEmail}`, {
      userId,
      action: 'kyc_submission_complete'
    });

    res.json(formatResponse(true, 'KYC documents submitted for review'));

  } catch (error) {
    logger.error(`KYC submission failed for user ${userEmail}: ${error.message}`, {
      userId,
      action: 'kyc_submission_failed',
      error: error.message,
      docType
    });
    res.status(500).json(formatResponse(false, 'KYC submission failed'));
  }
};

// Update Status of Individual KYC Documents - MODIFIED with validation and improved error handling
exports.updateKYCStatus = async (req, res) => {
  const { userId, docType, frontStatus, backStatus, status, reason } = req.body;
  const adminId = req.user._id; // Assuming admin user ID is in req.user

  try {
    logger.info(`Admin ${adminId} initiating KYC status update for user ${userId}, docType: ${docType}`, {
      adminId,
      userId,
      action: 'kyc_document_status_update_start',
      docType,
      frontStatus,
      backStatus,
      status
    });

    // --- Input Validation ---
    const validStatuses = ['pending', 'verified', 'rejected'];
    const hasStatusUpdate = frontStatus || backStatus || status; // Check if any status field is provided

    if (!userId || !docType || !hasStatusUpdate) {
        // Return 400 if mandatory fields or at least one status update are missing
        res.status(400).json(formatResponse(false, 'Invalid input: userId, docType, and at least one status (frontStatus, backStatus, or status) are required.'));
        throw new Error('Validation failed: Missing required fields for KYC document update');
    }

    // Validate status values
    if (frontStatus && !validStatuses.includes(frontStatus.toLowerCase())) {
         res.status(400).json(formatResponse(false, `Invalid value for frontStatus. Use: ${validStatuses.join(', ')}`));
         throw new Error(`Validation failed: Invalid frontStatus value: ${frontStatus}`);
    }
     if (backStatus && !validStatuses.includes(backStatus.toLowerCase())) {
         res.status(400).json(formatResponse(false, `Invalid value for backStatus. Use: ${validStatuses.join(', ')}`));
         throw new Error(`Validation failed: Invalid backStatus value: ${backStatus}`);
    }
     if (status && !validStatuses.includes(status.toLowerCase())) {
         res.status(400).json(formatResponse(false, `Invalid value for status. Use: ${validStatuses.join(', ')}`));
         throw new Error(`Validation failed: Invalid status value: ${status}`);
    }

    // Validate rejection reason if any status is 'rejected'
    const isAnyStatusRejected = (frontStatus?.toLowerCase() === 'rejected' || backStatus?.toLowerCase() === 'rejected' || status?.toLowerCase() === 'rejected');
    if (isAnyStatusRejected && !reason) {
         res.status(400).json(formatResponse(false, 'Rejection reason is required when setting a status to "rejected".'));
         throw new Error('Validation failed: Rejection reason missing for rejected status');
    }
    // --- End Input Validation ---


    // Find the User by userId
    const user = await User.findById(userId);

    if (!user) {
      // If user not found, return 404 explicitly
      logger.warn(`KYC status update failed: User not found for userId ${userId}`, { adminId, userId, docType });
      return res.status(404).json(formatResponse(false, 'User not found.'));
    }

    // Find the specific KYC document by docType
    // Ensure docType is compared case-insensitively if needed, or ensure consistency on frontend
    const kycDocument = user.kycDocuments.find(doc => doc.docType && doc.docType.toUpperCase() === docType.toUpperCase());


    if (!kycDocument) {
      // If document type not found for this user, return 404
      logger.warn(`KYC document of type ${docType} not found for user ${userId}`, { adminId, userId, docType });
      return res.status(404).json(formatResponse(false, `KYC document of type ${docType} not found for this user.`));
    }

    // Store previous status for audit/logging if needed
    const previousStatus = {
      front: kycDocument.frontStatus,
      back: kycDocument.backStatus,
      overall: kycDocument.status
    };

    // Update the document status fields based on provided input
    if (frontStatus) {
      kycDocument.frontStatus = frontStatus.toLowerCase();
    }
    if (backStatus) {
      kycDocument.backStatus = backStatus.toLowerCase();
    }
    if (status) {
      kycDocument.status = status.toLowerCase();
    }
    kycDocument.reviewedAt = new Date(); // Mark when reviewed
    kycDocument.reviewedBy = adminId; // Mark who reviewed
    if (reason) {
        kycDocument.reason = reason; // Save reason on the document itself if schema supports
    }


    // Recalculate overall user kycStatus based on individual document statuses
    const allDocs = user.kycDocuments;
    const allApproved = allDocs.length > 0 && allDocs.every(doc =>
         (doc.status === 'verified') || (doc.frontStatus === 'verified' && doc.backStatus === 'verified') // All required parts verified
    );
    const hasRejection = allDocs.some(doc =>
         (doc.status === 'rejected') || doc.frontStatus === 'rejected' || doc.backStatus === 'rejected' // Any part rejected
    );

    if (allApproved) {
      user.kycStatus = 'approved';
    } else if (hasRejection) {
      user.kycStatus = 'rejected';
    } else {
      user.kycStatus = 'pending'; // Default if some are pending/missing required
    }

    // Save the updated user document (saves embedded document changes too)
    await user.save();

    // Audit Log
    await AuditService.log('kyc_document_status_change', {
      userId: adminId,
      entityType: 'KYCDocument',
      entityId: kycDocument._id, // Assuming each document gets an _id by MongoDB
      metadata: {
        targetUserId: userId, // Log target user
        docType: kycDocument.docType, // Log the actual docType found
        previousStatus,
        newStatus: { front: kycDocument.frontStatus, back: kycDocument.backStatus, overall: kycDocument.status },
        reason
      }
    });

    // Send appropriate notifications based on the *final overall user status*
    // Or you might send notifications based on the *document type* status change
    // (e.g., "Passport Verified"). This depends on your desired notification flow.
    // Using the overall user status change notification for now.
     if (user.kycStatus === 'approved' && previousStatus.overall !== 'approved') { // Only send approval email on first approval
        await emailService.sendKYCApproval(user.email);
     } else if (user.kycStatus === 'rejected' && previousStatus.overall !== 'rejected') { // Only send rejection email on first rejection
        await emailService.sendKYCRejection(user.email, reason); // Assuming reason is relevant for overall rejection
     }


    logger.info(`KYC document status updated for user ${user.email}, docType: ${docType}`, {
      adminId,
      userId,
      action: 'kyc_document_status_update_complete',
      docType: kycDocument.docType,
      finalOverallStatus: user.kycStatus,
      updatedDocStatus: { front: kycDocument.frontStatus, back: kycDocument.backStatus, overall: kycDocument.status }
    });

    // Send final success response
    res.status(200).json(formatResponse(true, `KYC status updated for ${kycDocument.docType}`));

  } catch (error) {
    // Catch errors thrown by validation, database operations, or services
    logger.error(`KYC document status update failed: ${error.message}`, {
      adminId,
      userId, // Log userId from body if available
      docType, // Log docType from body if available
      action: 'kyc_document_status_update_failed',
      error: error.message,
      stack: error.stack, // Include stack trace in logs
      body: req.body // Log request body for debugging
    });

    // Check if a response status has already been set (e.g., by 404 checks)
    if (res.headersSent) {
        return; // If headers were sent, just exit
    }

    // Default: Return 500 for any other unexpected errors
    res.status(500).json(formatResponse(false, 'Failed to update KYC status'));
  }
};
