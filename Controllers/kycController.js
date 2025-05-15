const User = require('../models/User');
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

exports.updateKYCStatus = async (req, res) => {
  const { userId, status, reason } = req.body;
  const adminId = req.user._id;

  try {
    logger.info(`Admin ${adminId} initiating KYC status update`, {
      adminId,
      userId,
      action: 'kyc_status_update_start',
      status
    });

    const user = await User.findById(userId);
    if (!user) {
      throw new Error('User not found');
    }

    const previousStatus = user.kycStatus;
    user.kycStatus = status;

    // Update document statuses (needs adjustment for multiple documents)
    user.kycDocuments.forEach(doc => {
      doc.status = status === 'approved' ? 'verified' : 'rejected';
    });

    await user.save();

    await AuditService.log('kyc_status_change', {
      userId: adminId,
      entityType: 'User',
      entityId: userId,
      metadata: {
        previousStatus,
        newStatus: status,
        reason
      }
    });

    // Send appropriate notifications
    if (status === 'approved') {
      await emailService.sendKYCApproval(user.email);
    } else {
      await emailService.sendKYCRejection(user.email, reason);
    }

    logger.info(`KYC status updated to ${status} for user ${user.email}`, {
      adminId,
      userId,
      action: 'kyc_status_update_complete',
      status
    });

    res.json(formatResponse(true, `KYC status updated to ${status}`));

  } catch (error) {
    logger.error(`KYC status update failed: ${error.message}`, {
      adminId,
      userId,
      action: 'kyc_status_update_failed',
      error: error.message
    });

    res.status(500).json(formatResponse(false, 'Failed to update KYC status'));
  }
};

exports.updateKYCStatus = async (req, res) => {
  const { userId, docType, frontStatus, backStatus, status, reason } = req.body;
  const adminId = req.user._id;

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

    const user = await User.findById(userId);
    if (!user) {
      throw new Error('User not found');
    }

    const kycDocument = user.kycDocuments.find(doc => doc.docType.toUpperCase() === docType.toUpperCase());

    if (!kycDocument) {
      logger.warn(`KYC document of type ${docType} not found for user ${userId}`, { adminId, userId, docType });
      return res.status(404).json(formatResponse(false, `KYC document of type ${docType} not found for this user.`));
    }

    const previousStatus = {
      front: kycDocument.frontStatus,
      back: kycDocument.backStatus,
      overall: kycDocument.status
    };

    if (frontStatus) {
      kycDocument.frontStatus = frontStatus.toLowerCase();
    }
    if (backStatus) {
      kycDocument.backStatus = backStatus.toLowerCase();
    }
    if (status) {
      kycDocument.status = status.toLowerCase();
    }

    // Update overall kycStatus based on individual document statuses
    const allApproved = user.kycDocuments.every(doc => doc.status === 'verified' || (doc.frontStatus === 'verified' && doc.backStatus === 'verified'));
    const hasRejection = user.kycDocuments.some(doc => doc.status === 'rejected' || doc.frontStatus === 'rejected' || doc.backStatus === 'rejected');

    if (allApproved) {
      user.kycStatus = 'approved';
    } else if (hasRejection) {
      user.kycStatus = 'rejected';
    } else {
      user.kycStatus = 'pending';
    }

    await user.save();

    await AuditService.log('kyc_document_status_change', {
      userId: adminId,
      entityType: 'KYCDocument',
      entityId: kycDocument._id, // Assuming each document gets an _id by MongoDB
      metadata: {
        docType,
        previousStatus,
        newStatus: { front: kycDocument.frontStatus, back: kycDocument.backStatus, overall: kycDocument.status },
        reason
      }
    });

    // Send appropriate notifications (consider refining based on approval/rejection of specific documents)
    if (user.kycStatus === 'approved') {
      await emailService.sendKYCApproval(user.email);
    } else if (user.kycStatus === 'rejected') {
      await emailService.sendKYCRejection(user.email, reason);
    }

    logger.info(`KYC status updated for user ${user.email}, docType: ${docType} to front: ${kycDocument.frontStatus}, back: ${kycDocument.backStatus}, overall: ${kycDocument.status}`, {
      adminId,
      userId,
      action: 'kyc_document_status_update_complete',
      docType,
      frontStatus: kycDocument.frontStatus,
      backStatus: kycDocument.backStatus,
      status: kycDocument.status
    });

    res.json(formatResponse(true, `KYC status updated for ${docType}`));

  } catch (error) {
    logger.error(`KYC status update failed: ${error.message}`, {
      adminId,
      userId,
      action: 'kyc_document_status_update_failed',
      error: error.message,
      docType,
      frontStatus,
      backStatus,
      status
    });
    res.status(500).json(formatResponse(false, 'Failed to update KYC status'));
  }
};
