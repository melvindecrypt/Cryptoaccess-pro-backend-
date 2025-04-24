const User = require('../models/user');

/**
 * Middleware to ensure that the user has completed and passed KYC verification.
 * Blocks access to certain routes if KYC status is not 'approved'.
 */
const requireKYC = async (req, res, next) => {
  try {
    const userId = req.user?.id || req.user?._id;

    if (!userId) {
      return res.status(401).json({
        error: 'Unauthorized',
        message: 'User ID is missing in request context. Please log in again.'
      });
    }

    // Retrieve user from database
    const user = await User.findById(userId).select('kycStatus email');
    if (!user) {
      return res.status(404).json({
        error: 'User Not Found',
        message: 'No user associated with this session.'
      });
    }

    // Check KYC status
    if (user.kycStatus !== 'approved') {
      return res.status(403).json({
        error: 'KYC Required',
        message: `KYC not approved. Current status: ${user.kycStatus}. Please complete your verification.`
      });
    }

    // Allow request to continue
    next();

  } catch (err) {
    console.error('Error in requireKYC middleware:', err.message);
    return res.status(500).json({
      error: 'Server Error',
      message: 'An unexpected error occurred while checking KYC status.'
    });
  }
};

module.exports = requireKYC;