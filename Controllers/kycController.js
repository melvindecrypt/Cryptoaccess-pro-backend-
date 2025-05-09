const User = require('../models/User');
const { formatResponse } = require('../utils/helpers');
const logger = require('../utils/logger');
const AuditService = require('../services/auditService');
const emailService = require('../services/emailService');

exports.submitKYC = async (req, res) => {
  const { idImage, selfieImage } = req.files;
  const userId = req.user._id;
  const userEmail = req.user.email;

  try {
    logger.info(`KYC submission initiated for user ${userEmail}`, {
      userId,
      action: 'kyc_submission_start',
      metadata: {
        fileCount: Object.keys(req.files).length
      }
    });

    const user = await User.findById(userId);
    if (!user) {
      throw new Error('User not found');
    }

    // Store document references
    user.kycDocuments = [
      {
        docType: 'ID',
        fileUrl: `/kyc/${idImage[0].filename}`,
        status: 'pending',
        uploadedAt: new Date()
      },
      {
        docType: 'SELFIE',
        fileUrl: `/kyc/${selfieImage[0].filename}`,
        status: 'pending',
        uploadedAt: new Date()
      }
    ];
    user.kycStatus = 'pending';

    await user.save();

    await AuditService.log('kyc_submission', {
      userId,
      entityType: 'User',
      entityId: userId,
      metadata: {
        documents: user.kycDocuments.map(doc => doc.docType)
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
      error: error.message
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
    
    // Update document statuses
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