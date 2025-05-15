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

exports.getKYCStatus = async (req, res) => {
  const userId = req.user._id;
  const userEmail = req.user.email;

  try {
    logger.info(`Fetching KYC status for user ${userEmail}`, { userId, action: 'get_kyc_status_start' });

    const user = await User.findById(userId).select('kycStatus');

    if (!user) {
      logger.warn(`User not found while fetching KYC status: ${userEmail}`, { userId, action: 'get_kyc_status_failed', reason: 'User not found' });
      return res.status(404).json(formatResponse(false, 'User not found'));
    }

    const status = user.kycStatus;
    let message = '';

    switch (status) {
      case 'pending':
        message = 'KYC verification is pending. Please wait for admin approval.';
        break;
      case 'approved':
        message = 'KYC verification is approved.';
        break;
      case 'rejected':
        message = 'KYC verification was rejected. Please check your submitted documents or contact support.';
        break;
      default:
        message = 'KYC status is unknown.';
    }

    logger.info(`KYC status fetched successfully for user ${userEmail}: ${status}`, { userId, action: 'get_kyc_status_complete', status });
    res.json(formatResponse(true, message, { status }));

  } catch (error) {
    logger.error(`Error fetching KYC status for user ${userEmail}: ${error.message}`, { userId, action: 'get_kyc_status_failed', error: error.message });
    res.status(500).json(formatResponse(false, 'Failed to fetch KYC status'));
  }
};
