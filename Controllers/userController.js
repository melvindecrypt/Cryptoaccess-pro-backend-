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