// File: controllers/withdrawalController.js
const Withdrawal = require('../models/Withdrawal');
const User = require('../models/User');
const { formatResponse } = require('../utils/helpers');
const logger = require('../utils/logger');

exports.createWithdrawal = async (req, res) => {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const { currency, amount, destinationAddress } = req.body;
    const numericAmount = new Decimal(amount);

    // Validate withdrawal
    const user = await User.findById(req.user._id).session(session);
    if (!user) throw new Error('User not found');
    if (user.kycStatus !== 'approved') {
      throw new Error('KYC verification required');
    }

    // Check balance
    const balance = new Decimal(user.virtualBalances[currency] || 0);
    if (balance.lessThan(numericAmount)) {
      throw new Error('Insufficient balance');
    }

    // Create withdrawal request
    const withdrawal = await Withdrawal.create([{
      user: user._id,
      currency,
      amount: numericAmount.toNumber(),
      destinationAddress
    }], { session });

    // Lock funds (deduct from available balance)
    user.virtualBalances[currency] = balance.minus(numericAmount).toNumber();
    await user.save({ session });

    await session.commitTransaction();
    logger.info(`Withdrawal requested: ${withdrawal[0]._id}`);

    res.json(formatResponse(true, 'Withdrawal request submitted', {
      withdrawalId: withdrawal[0]._id,
      status: 'pending'
    }));

  } catch (error) {
    await session.abortTransaction();
    res.status(400).json(formatResponse(false, error.message));
  } finally {
    session.endSession();
  }
};

// In admin withdrawal handler
await notificationService.create(
  withdrawal.user,
  'withdrawal',
  `Withdrawal ${action}`,
  `Your ${withdrawal.currency} withdrawal has been ${action}`,
  { 
    amount: withdrawal.amount,
    status: action 
  }
);