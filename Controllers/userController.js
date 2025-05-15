const User = require('../models/User');
const Wallet = require('../models/Wallet');

// Unified response format
const formatResponse = (success, message, data = null) => ({
  status: success ? 'success' : 'error',
  code: success ? 200 : 400,
  message,
  data
});

exports.getProfile = async (req, res) => {
  try {
    const user = await User.findById(req.user._id)
      .populate('wallet', 'balances transactions')
      .select('-password -__v -failedLoginAttempts -lockUntil');

    if (!user) {
      return res.status(404).json(formatResponse(false, 'User not found'));
    }

    res.json(formatResponse(true, 'Profile retrieved successfully', user));
  } catch (error) {
    res.status(500).json(formatResponse(false, 'Server error', { error: error.message }));
  }
};

exports.updateSecurity = async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body;

    // Validate input
    if (!currentPassword || !newPassword) {
      return res.status(400).json(formatResponse(false, 'Both current and new password are required'));
    }

    const user = await User.findById(req.user._id);

    // Verify current password
    const isMatch = await user.comparePassword(currentPassword);
    if (!isMatch) {
      return res.status(401).json(formatResponse(false, 'Current password is incorrect'));
    }

    // Validate new password strength
    if (newPassword.length < 12 || !/\d/.test(newPassword) || !/[A-Z]/.test(newPassword)) {
      return res.status(400).json(formatResponse(false, 
        'Password must be at least 12 characters with a number and uppercase letter'));
    }

    user.password = newPassword;
    await user.save();

    res.json(formatResponse(true, 'Password updated successfully'));
  } catch (error) {
    res.status(500).json(formatResponse(false, 'Server error', { error: error.message }));
  }
};

exports.uploadKycDoc = async (req, res) => {
  try {
    const { docType, fileURL } = req.body;

    // Validate input
    if (!docType || !fileURL) {
      return res.status(400).json(formatResponse(false, 'Both docType and fileURL are required'));
    }

    // Validate document type
    const allowedDocTypes = ['PASSPORT', 'DRIVERS_LICENSE', 'NATIONAL_ID'];
    if (!allowedDocTypes.includes(docType)) {
      return res.status(400).json(formatResponse(false, 
        'Invalid document type. Allowed types: PASSPORT, DRIVERS_LICENSE, NATIONAL_ID'));
    }

    const updatedUser = await User.findByIdAndUpdate(
      req.user._id,
      {
        $push: { 
          kycDocs: { 
            docType, 
            fileURL,
            status: 'PENDING_REVIEW',
            uploadedAt: new Date()
          } 
        }
      },
      { new: true, runValidators: true }
    ).select('kycDocs');

    if (!updatedUser) {
      return res.status(404).json(formatResponse(false, 'User not found'));
    }

    res.json(formatResponse(true, 'Document uploaded for verification', {
      kycStatus: updatedUser.kycStatus,
      documents: updatedUser.kycDocs
    }));
  } catch (error) {
    res.status(500).json(formatResponse(false, 'Server error', { error: error.message }));
  }
};

// In userController.js
const User = require('../models/User');
const Wallet = require('../models/Wallet');
const Investment = require('../models/Investment'); // Assuming you have an Investment model
const InvestmentPlan = require('../models/InvestmentPlan'); // Assuming you have an InvestmentPlan model

// Unified response format (assuming you have this defined)
const formatResponse = (success, message, data = null) => ({
  status: success ? 'success' : 'error',
  code: success ? 200 : (data?.code || 400), // Use data.code if provided, otherwise default to 400
  message,
  data,
});

exports.getDashboardData = async (req, res) => {
  try {
    const userId = req.user._id;

    // Fetch user details (including email, walletId, accessStatus, KYC, Pro+)
    const user = await User.findById(userId).select('email walletId kycStatus accessStatus proPlusStatus');

    if (!user) {
      return res.status(404).json(formatResponse(false, 'User not found'));
    }

    // Check access status
    if (user.accessStatus !== 'granted') {
      return res.status(403).json(formatResponse(false, 'Access forbidden. Access fee may not have been paid.'));
    }

    // Fetch wallet balances
    const wallet = await Wallet.findOne({ userId }).select('balances');

    // Fetch active investment plans for the user
    const activePlans = await Investment.find({ userId: userId, status: 'active' })
      .populate('planId', 'name roi duration') // Populate plan details
      .select('planId amountInvested status');

    const formattedActivePlans = activePlans.map(investment => ({
      planId: investment.planId.id,
      name: investment.planId.name,
      amountInvested: investment.amountInvested,
      roi: investment.planId.roi,
      duration: investment.planId.duration,
      status: investment.status,
    }));

    // Fetch available investment plans (assuming you want all available plans)
    const availablePlans = await InvestmentPlan.find({ status: 'available' }) // Adjust query as needed
      .select('name minAmount roi duration');

    const formattedAvailablePlans = availablePlans.map(plan => ({
      id: plan._id,
      name: plan.name,
      minAmount: plan.minAmount,
      roi: plan.roi,
      duration: plan.duration,
    }));

    const dashboardData = {
      user: {
        email: user.email,
        walletId: user.walletId,
        balance: wallet?.balances || {},
        kycStatus: user.kycStatus,
        accessStatus: user.accessStatus,
      },
      investmentStatus: {
        activePlans: formattedActivePlans,
        availablePlans: formattedAvailablePlans,
      },
      proPlusStatus: user.proPlusStatus ? 'active' : 'inactive',
    };

    res.json(formatResponse(true, 'Dashboard data retrieved successfully', dashboardData));

  } catch (error) {
    console.error('Error fetching dashboard data:', error);
    res.status(500).json(formatResponse(false, 'Server error fetching dashboard data', { error: error.message }));
  }
};

const User = require('../models/User');
const { formatResponse } = require('../utils/helpers');
const validator = require('validator'); // For email validation

exports.getSettings = async (req, res) => {
  try {
    const user = await User.findById(req.user._id).select('name email language');

    if (!user) {
      return res.status(404).json(formatResponse(false, 'User not found'));
    }

    res.json(formatResponse(true, 'Settings retrieved successfully', {
      user: {
        name: user.name,
        email: user.email,
        language: user.language,
      },
    }));
  } catch (error) {
    res.status(500).json(formatResponse(false, 'Server error', { error: error.message }));
  }
};

exports.updateSettings = async (req, res) => {
  try {
    const { name, surname, phone } = req.body;
    const updateFields = {};

    if (name !== undefined) {
      updateFields.name = name;
    }

    if (surname !== undefined) {
      updateFields.surname = surname;
    }

    if (phone !== undefined) {
      updateFields.phone = phone;
    }

    const updatedUser = await User.findByIdAndUpdate(
      req.user._id,
      { $set: updateFields },
      { new: true, runValidators: true, select: 'name surname phone email /* Keep email in select for response */' }
    );

    if (!updatedUser) {
      return res.status(404).json(formatResponse(false, 'User not found'));
    }

    res.json(formatResponse(true, 'Profile updated successfully.', {
      user: {
        name: updatedUser.name,
        surname: updatedUser.surname,
        phone: updatedUser.phone,
        email: updatedUser.email, // Include email in the response
      },
    }));
  } catch (error) {
    res.status(500).json(formatResponse(false, 'Server error', { error: error.message }));
  }
};


