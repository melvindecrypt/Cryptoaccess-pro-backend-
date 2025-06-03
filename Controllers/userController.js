import User from '../models/user.js';
import Wallet from '../models/wallet.js';
import Investment from '../models/investment.js';
import InvestmentPlan from '../models/investmentPlan.js';
import { formatResponse } from '../utils/helpers.js';
import validator from 'validator';

// Unified response format
const formatResponse = (success, message, data = null) => ({
  status: success ? 'success' : 'error',
  code: success ? 200 : (data?.code || 400), // Use data.code if provided, otherwise default to 400
  message,
  data,
});

// Get Profile
export const getProfile = async (req, res) => {
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

// Update Security
export const updateSecurity = async (req, res) => {
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
      return res.status(400).json(
        formatResponse(false, 'Password must be at least 12 characters with a number and uppercase letter')
      );
    }

    user.password = newPassword;
    await user.save();
    res.json(formatResponse(true, 'Password updated successfully'));
  } catch (error) {
    res.status(500).json(formatResponse(false, 'Server error', { error: error.message }));
  }
};

// Get Dashboard Data
export const getDashboardData = async (req, res) => {
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

    const formattedActivePlans = activePlans.map((investment) => ({
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

    const formattedAvailablePlans = availablePlans.map((plan) => ({
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

// Get Settings
export const getSettings = async (req, res) => {
  try {
    const user = await User.findById(req.user._id).select('name email language');
    if (!user) {
      return res.status(404).json(formatResponse(false, 'User not found'));
    }
    res.json(
      formatResponse(true, 'Settings retrieved successfully', {
        user: {
          name: user.name,
          email: user.email,
          language: user.language,
        },
      })
    );
  } catch (error) {
    res.status(500).json(formatResponse(false, 'Server error', { error: error.message }));
  }
};

// Update Settings
export const updateSettings = async (req, res) => {
  try {
    // Destructure all expected updateable fields, including 'language'
    const { name, surname, phone, language } = req.body;
    const updateFields = {};

    // Conditionally add fields to updateFields if they are provided in the request body
    if (name !== undefined) {
      updateFields.name = name;
    }
    if (surname !== undefined) {
      updateFields.surname = surname;
    }
    if (phone !== undefined) {
      updateFields.phone = phone;
    }
    // *** NEW: Add language to updateFields if it's provided ***
    if (language !== undefined) {
      updateFields.language = language;
    }

    // Optional: Return an error if no fields are provided for update
    if (Object.keys(updateFields).length === 0) {
        return res.status(400).json(formatResponse(false, 'No fields provided for update.'));
    }

    const updatedUser = await User.findByIdAndUpdate(
      req.user._id, // Assuming req.user._id contains the authenticated user's ID
      { $set: updateFields },
      {
        new: true, // Return the updated document
        runValidators: true, // Run schema validators on update
        // Select all fields you want in the response, including the new 'language' field
        select: 'name surname phone email language'
      }
    );

    if (!updatedUser) {
      return res.status(404).json(formatResponse(false, 'User not found'));
    }

    // Send back the updated user details, including language
    res.json(
      formatResponse(true, 'Profile updated successfully.', {
        user: {
          name: updatedUser.name,
          surname: updatedUser.surname,
          phone: updatedUser.phone,
          email: updatedUser.email,
          language: updatedUser.language, // Include language in the response
        },
      })
    );
  } catch (error) {
    console.error('Error updating settings:', error); // Log the actual error for debugging
    res.status(500).json(formatResponse(false, 'Server error', { error: error.message }));
  }
};
