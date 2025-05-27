// controllers/kycController.js
import User from '../models/user.js';
import { formatResponse } from '../utils/helpers.js';
import logger from '../utils/logger.js';
import AuditService from '../services/auditService.js';
import emailService from '../services/emailService.js';

export const submitKYC = async (req, res) => {
  const { docType } = req.body;
  const { idFront, idBack, selfie } = req.files;
  const userId = req.user._id;
  const userEmail = req.user.email;

  try {
    logger.info(`KYC submission initiated for user ${userEmail}`, {
      userId,
      action: 'kyc_submission_start',
      metadata: { fileCount: Object.keys(req.files).length, docType },
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
      uploadedAt: new Date(),
    };

    // Add the new document to the kycDocuments array
    user.kycDocuments.push(newKycDocument);

    // Update overall KYC status based on all documents
    const allDocs = user.kycDocuments;
    const allApproved = allDocs.every(
      (doc) =>
        (doc.status === 'verified') ||
        (doc.frontStatus === 'verified' && doc.backStatus === 'verified') // All required parts verified
    );
    const hasRejection = allDocs.some(
      (doc) =>
        (doc.status === 'rejected') ||
        doc.frontStatus === 'rejected' ||
        doc.backStatus === 'rejected' // Any part rejected
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
    await AuditService.logAction({
      userId,
      action: 'kyc_submission_complete',
      details: `KYC submitted with docType: ${docType}`,
    });

    // Send confirmation email
    try {
      await emailService.sendEmail({
        to: userEmail,
        subject: 'KYC Submission Received',
        template: 'kycSubmitted',
        data: { name: user.name, docType },
      });
    } catch (emailError) {
      logger.error(`Failed to send KYC submission email to ${userEmail}: ${emailError.message}`);
    }

    res.json(formatResponse(true, 'KYC documents submitted successfully.', { kycStatus: user.kycStatus }));
  } catch (error) {
    logger.error(`Error during KYC submission for user ${userEmail}: ${error.message}`, error);
    res.status(500).json(formatResponse(false, 'Server error during KYC submission.', { error: error.message }));
  }
};

export const updateKycStatus = async (req, res) => {
  const { userId, docType, frontStatus, backStatus, status } = req.body;
  const adminId = req.user._id; // Assuming admin user ID is in req.user

  try {
    logger.info(`Admin ${adminId} initiating KYC status update for user ${userId}, docType: ${docType}`, {
      adminId,
      userId,
      action: 'kyc_document_status_update_start',
      docType,
      frontStatus,
      backStatus,
      status,
    });

    // Input Validation
    const validStatuses = ['pending', 'verified', 'rejected'];
    const hasStatusUpdate = frontStatus || backStatus || status; // Check if any status field is provided

    if (!userId || !docType || !hasStatusUpdate) {
      return res.status(400).json(formatResponse(false, 'Missing required fields or no status updates provided.'));
    }

    if (frontStatus && !validStatuses.includes(frontStatus.toLowerCase())) {
      return res.status(400).json(formatResponse(false, `Invalid value for frontStatus. Use: ${validStatuses.join(', ')}`));
    }

    if (backStatus && !validStatuses.includes(backStatus.toLowerCase())) {
      return res.status(400).json(formatResponse(false, `Invalid value for backStatus. Use: ${validStatuses.join(', ')}`));
    }

    if (status && !validStatuses.includes(status.toLowerCase())) {
      return res.status(400).json(formatResponse(false, `Invalid value for status. Use: ${validStatuses.join(', ')}`));
    }

    // Find the user
    const user = await User.findById(userId);
    if (!user) {
      throw new Error('User not found');
    }

    // Find the specific KYC document by docType
    const kycDoc = user.kycDocuments.find((doc) => doc.docType === docType.toUpperCase());
    if (!kycDoc) {
      return res.status(404).json(formatResponse(false, `No KYC document found for docType: ${docType}`));
    }

    // Update statuses
    if (frontStatus) kycDoc.frontStatus = frontStatus.toLowerCase();
    if (backStatus) kycDoc.backStatus = backStatus.toLowerCase();
    if (status) kycDoc.status = status.toLowerCase();

    // Determine overall KYC status
    const allDocs = user.kycDocuments;
    const allApproved = allDocs.every(
      (doc) =>
        (doc.status === 'verified') ||
        (doc.frontStatus === 'verified' && doc.backStatus === 'verified')
    );
    const hasRejection = allDocs.some(
      (doc) =>
        (doc.status === 'rejected') ||
        doc.frontStatus === 'rejected' ||
        doc.backStatus === 'rejected'
    );

    if (allApproved) {
      user.kycStatus = 'approved';
    } else if (hasRejection) {
      user.kycStatus = 'rejected';
    } else {
      user.kycStatus = 'pending';
    }

    // Save updates
    await user.save();

    // Audit Log
    await AuditService.logAction({
      userId,
      action: 'kyc_document_status_update',
      details: `KYC status updated for docType: ${docType}`,
    });

    // Notify user via email
    try {
      const emailSubject =
        status === 'verified'
          ? 'KYC Approved'
          : status === 'rejected'
          ? 'KYC Rejected'
          : 'KYC Status Updated';
      const emailTemplate =
        status === 'verified'
          ? 'kycApproved'
          : status === 'rejected'
          ? 'kycRejected'
          : 'kycStatusUpdated';

      await emailService.sendEmail({
        to: user.email,
        subject: emailSubject,
        template: emailTemplate,
        data: { name: user.name, docType, status },
      });
    } catch (emailError) {
      logger.error(`Failed to send KYC status update email to ${user.email}: ${emailError.message}`);
    }

    res.json(formatResponse(true, 'KYC document status updated successfully.', { kycStatus: user.kycStatus }));
  } catch (error) {
    logger.error(`Error updating KYC status for user ${userId}: ${error.message}`, error);
    res.status(500).json(formatResponse(false, 'Server error during KYC status update.', { error: error.message }));
  }
};