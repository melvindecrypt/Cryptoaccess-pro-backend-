import User from '../models/user.js';
import Withdrawal from '../models/withdrawal.js';
import Investment from '../models/investment.js';
import { InsufficientBalanceError, NotFoundError } from '../utils/errors.js';
import logger from '../utils/logger.js';

export const simulateInvestmentPayout = async (userId, planId, amountInvested) => {
  const session = await User.startSession();
  session.startTransaction();

  try {
    const investmentPlan = await Investment.findById(planId).session(session);
    if (!investmentPlan) {
      throw new NotFoundError('Investment plan not found');
    }

    const user = await User.findById(userId).session(session);
    if (!user) {
      throw new NotFoundError('User not found');
    }

    const payoutAmount = amountInvested * (investmentPlan.roiPercentage / 100);
    const updatePath = `virtualBalances.${investmentPlan.currency}`;

    const updatedUser = await User.findByIdAndUpdate(
      userId,
      { $inc: { [updatePath]: payoutAmount } },
      { new: true, session }
    );

    await session.commitTransaction();
    logger.info(`Simulated payout: ${payoutAmount} ${investmentPlan.currency} to user ${userId}`);
    return updatedUser;
  } catch (error) {
    await session.abortTransaction();
    logger.error('Investment simulation failed', { error: error.message });
    throw error;
  } finally {
    session.endSession();
  }
};

export const simulateWithdrawalProcessing = async (withdrawalId) => {
  try {
    const withdrawal = await Withdrawal.findByIdAndUpdate(
      withdrawalId,
      {
        status: 'processed',
        processedAt: new Date(),
        adminNotes: 'Simulated processing complete',
      },
      { new: true }
    ).populate('user', 'email');

    if (!withdrawal) {
      throw new NotFoundError('Withdrawal request not found');
    }

    logger.info(`Simulated withdrawal processing: ${withdrawalId}`);
    return withdrawal;
  } catch (error) {
    logger.error('Withdrawal simulation failed', { error: error.message });
    throw error;
  }
};

export const applyAdminCredit = async (userId, currency, amount, reason) => {
  const session = await User.startSession();
  session.startTransaction();

  try {
    const user = await User.findById(userId).session(session);
    if (!user) {
      throw new NotFoundError('User not found');
    }

    const updatePath = `virtualBalances.${currency}`;
    const newBalance = (user.virtualBalances.get(currency) || 0) + amount;

    const updatedUser = await User.findByIdAndUpdate(
      userId,
      { $set: { [updatePath]: newBalance } },
      { new: true, session }
    );

    updatedUser.transactions.push({
      type: 'admin_credit',
      currency,
      amount,
      reason,
      timestamp: new Date(),
    });

    await updatedUser.save({ session });
    await session.commitTransaction();

    logger.info(`Admin credit applied: ${amount} ${currency} to ${userId}`);
    return updatedUser;
  } catch (error) {
    await session.abortTransaction();
    logger.error('Admin credit failed', { error: error.message });
    throw error;
  } finally {
    session.endSession();
  }
};

export const applyAdminDebit = async (userId, currency, amount, reason) => {
  const session = await User.startSession();
  session.startTransaction();

  try {
    const user = await User.findById(userId).session(session);
    if (!user) {
      throw new NotFoundError('User not found');
    }

    const currentBalance = user.virtualBalances.get(currency) || 0;
    if (currentBalance < amount) {
      throw new InsufficientBalanceError(`Insufficient ${currency} balance`);
    }

    const updatePath = `virtualBalances.${currency}`;
    const newBalance = currentBalance - amount;

    const updatedUser = await User.findByIdAndUpdate(
      userId,
      { $set: { [updatePath]: newBalance } },
      { new: true, session }
    );

    updatedUser.transactions.push({
      type: 'admin_debit',
      currency,
      amount,
      reason,
      timestamp: new Date(),
    });

    await updatedUser.save({ session });
    await session.commitTransaction();

    logger.info(`Admin debit applied: ${amount} ${currency} from ${userId}`);
    return updatedUser;
  } catch (error) {
    await session.abortTransaction();
    logger.error('Admin debit failed', { error: error.message });
    throw error;
  } finally {
    session.endSession();
  }
};