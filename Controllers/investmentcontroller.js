const User = require('../models/User');
const Investment = require('../models/Investment'); // Assuming you have this model
const InvestmentPlan = require('../models/InvestmentPlan'); // Assuming you have this model
const Wallet = require('../models/Wallet');
const { formatResponse } = require('../utils/helpers');
const logger = require('../utils/logger');
const Decimal = require('decimal.js');
const { v4: uuidv4 } = require('uuid'); // For generating unique investment IDs
const mongoose = require('mongoose');

// View available investment plans
exports.viewPlans = async (req, res) => {
  try {
    const plans = await InvestmentPlan.find({ status: 'available' }) // Fetch from InvestmentPlan model
      .select('name minAmount roi duration');

    const formattedPlans = plans.map(plan => ({
      id: plan._id, // Use MongoDB ObjectId as ID
      name: plan.name,
      minAmount: plan.minAmount.toNumber(), // Convert Decimal to number (float)
      roi: plan.roi.toNumber(),           // Convert Decimal to number (integer is expected by API, adjust if needed)
      duration: plan.duration,
    }));

    res.json(formatResponse(true, 'Investment plans fetched successfully', { plans: formattedPlans }));
  } catch (error) {
    logger.error('Error fetching plans: ' + error.message);
    res.status(500).json(formatResponse(false, 'Error fetching investment plans', { error: error.message }));
  }
};

// Make an Investment (Requires KYC - you might want to add this middleware)
exports.invest = async (req, res) => {
  const { planId, amount } = req.body;
  const userId = req.user._id;

  try {
    if (!planId || typeof amount !== 'number' || amount <= 0) {
      return res.status(400).json(formatResponse(false, 'Valid plan ID and amount required'));
    }

    const decimalAmount = new Decimal(amount);

    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json(formatResponse(false, 'User not found'));
    }

    const plan = await InvestmentPlan.findById(planId);
    if (!plan) {
      return res.status(404).json(formatResponse(false, 'Investment plan not found'));
    }

    if (decimalAmount.lessThan(plan.minAmount)) {
      return res.status(400).json(formatResponse(false, `Amount must be at least ${plan.minAmount.toNumber()}`));
    }

    // You might want to check user's balance here before proceeding

    const newInvestment = new Investment({
      user: userId,
      plan: plan._id, // Store the ObjectId of the plan
      planName: plan.name, // Store plan name for easy access
      amount: decimalAmount.toNumber(),
      roi: plan.roi.toNumber(),
      duration: plan.duration,
      startDate: new Date(),
      endDate: calculateEndDate(new Date(), plan.duration), // Implement this function
      status: 'active',
      investmentId: uuidv4(), // Generate a unique investment ID
    });

    await newInvestment.save();

    res.status(201).json(formatResponse(true, 'Investment started successfully', { // Use 201 for resource creation
      investmentId: newInvestment.investmentId,
      plan: newInvestment.planName,
      amount: newInvestment.amount,
      roi: newInvestment.roi,
      duration: newInvestment.duration,
      status: newInvestment.status,
      startDate: newInvestment.startDate,
      endDate: newInvestment.endDate,
    }));

  } catch (error) {
    logger.error('Investment error: ' + error.message);
    res.status(500).json(formatResponse(false, 'Error processing investment', { error: error.message }));
  }
};

// Helper function to calculate end date based on duration (you'll need to implement this)
function calculateEndDate(startDate, duration) {
  // Example implementation (you might need more sophisticated logic)
  const [value, unit] = duration.split(' ');
  const months = parseInt(value, 10);
  const endDate = new Date(startDate);
  endDate.setMonth(startDate.getMonth() + months);
  return endDate;
}

exports.getInvestmentDetails = async (req, res) => {
  try {
    const investment = await Investment.findOne({ _id: req.params.id, user: req.user.id })
      .populate('plan', 'name'); // Populate plan details if needed

    if (!investment) {
      return res.status(404).json({ success: false, message: 'Investment not found' });
    }

    const investmentDetails = {
      _id: investment._id,
      user: investment.user,
      amount: investment.amount,
      plan: investment.planName || (investment.plan && investment.plan.name) || 'N/A', // Get plan name
      status: investment.status,
      startDate: investment.startDate,
      endDate: investment.endDate,
      roiHistory: investment.roiHistory || [],
      createdAt: investment.createdAt,
      updatedAt: investment.updatedAt,
    };

    res.json({ success: true, investment: investmentDetails });
  } catch (err) {
    logger.error('Error fetching investment details: ' + err.message);
    res.status(500).json({ success: false, message: 'Server error', error: err.message });
  }
};

exports.cancelInvestment = async (req, res) => {
  try {
    const investment = await Investment.findOne({ _id: req.params.id, user: req.user.id });

    if (!investment) {
      return res.status(404).json({ success: false, message: 'Investment not found' });
    }

    if (investment.status !== 'active') {
      return res.status(400).json({ success: false, message: 'Only active investments can be cancelled' });
    }

    investment.status = 'cancelled';
    await investment.save();

    res.json({
      success: true,
      message: 'Investment cancelled',
      investment: {
        _id: investment._id,
        status: investment.status,
      },
    });
  } catch (err) {
    logger.error('Error cancelling investment: ' + err.message);
    res.status(500).json({ success: false, message: 'Server error', error: err.message });
  }
};

// Make an Investment (Requires KYC - you might want to add this middleware)
exports.invest = async (req, res) => {
  const { planId, amount } = req.body;
  const userId = req.user._id;
  const investmentCurrency = 'USD'; // Or determine based on plan/user preference

  try {
    if (!planId || typeof amount !== 'number' || amount <= 0) {
      return res.status(400).json(formatResponse(false, 'Valid plan ID and amount required'));
    }

    const decimalAmount = new Decimal(amount);

    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json(formatResponse(false, 'User not found'));
    }

    const plan = await InvestmentPlan.findById(planId);
    if (!plan) {
      return res.status(404).json(formatResponse(false, 'Investment plan not found'));
    }

    if (decimalAmount.lessThan(plan.minAmount)) {
      return res.status(400).json(formatResponse(false, `Amount must be at least ${plan.minAmount.toNumber()}`));
    }

    // Fetch user's wallet balance
    const wallet = await Wallet.findOne({ userId: userId });
    if (!wallet) {
      return res.status(404).json(formatResponse(false, 'User wallet not found'));
    }

    const currentBalance = new Decimal(wallet.balances[investmentCurrency] || 0);

    // Check for sufficient balance
    if (currentBalance.lessThan(decimalAmount)) {
      return res.status(402).json(formatResponse(false, `Insufficient ${investmentCurrency} balance`));
    }

    // Proceed with investment (and deduct balance - be careful with transactions)
    const newInvestment = new Investment({
      user: userId,
      plan: plan._id,
      planName: plan.name,
      amount: decimalAmount.toNumber(),
      roi: plan.roi.toNumber(),
      duration: plan.duration,
      startDate: new Date(),
      endDate: calculateEndDate(new Date(), plan.duration),
      status: 'active',
      investmentId: uuidv4(),
    });

    // Start a database transaction to ensure atomicity (deduct balance and create investment)
    const session = await mongoose.startSession();
    session.startTransaction();

    try {
      // Deduct balance from the user's wallet
      wallet.balances[investmentCurrency] = currentBalance.minus(decimalAmount).toNumber();
      await wallet.save({ session });

      // Save the new investment
      await newInvestment.save({ session });

      await session.commitTransaction();
      session.endSession();

      res.status(201).json(formatResponse(true, 'Investment started successfully', {
        investmentId: newInvestment.investmentId,
        plan: newInvestment.planName,
        amount: newInvestment.amount,
        roi: newInvestment.roi,
        duration: newInvestment.duration,
        status: newInvestment.status,
        startDate: newInvestment.startDate,
        endDate: newInvestment.endDate,
      }));

    } catch (transactionError) {
      await session.abortTransaction();
      session.endSession();
      logger.error('Investment transaction error: ' + transactionError.message);
      return res.status(500).json(formatResponse(false, 'Error processing investment transaction', { error: transactionError.message }));
    }

  } catch (error) {
    logger.error('Investment error: ' + error.message);
    res.status(500).json(formatResponse(false, 'Error processing investment', { error: error.message }));
  }
};

// Helper function to calculate end date based on duration
function calculateEndDate(startDate, duration) {
    const [value, unit] = duration.split(' ');
    const months = parseInt(value, 10);
    const endDate = new Date(startDate);
    endDate.setMonth(startDate.getMonth() + months);
    return endDate;
}

// View available investment plans (Adjusted to use InvestmentPlan model)
exports.viewPlans = async (req, res) => {
    try {
        const plans = await InvestmentPlan.find({ status: 'available' })
            .select('name minAmount roi duration _id'); // Include _id

        const formattedPlans = plans.map(plan => ({
            id: plan._id.toString(), // Convert ObjectId to string
            name: plan.name,
            minAmount: plan.minAmount,
            roi: plan.roi,
            duration: plan.duration,
        }));

        res.json(formatResponse(true, 'Investment plans fetched successfully', { plans: formattedPlans }));
    } catch (error) {
        logger.error('Error fetching plans: ' + error.message);
        res.status(500).json(formatResponse(false, 'Error fetching investment plans', { error: error.message }));
    }
};

// Make an Investment (Adjusted to use Investment model)
exports.invest = async (req, res) => {
    const { planId, amount } = req.body;
    const userId = req.user._id;
    const investmentCurrency = 'USD'; // Or determine based on plan/user preference

    try {
        if (!planId || typeof amount !== 'number' || amount <= 0) {
            return res.status(400).json(formatResponse(false, 'Valid plan ID and amount required'));
        }

        const decimalAmount = new Decimal(amount);

        const user = await User.findById(userId);
        if (!user) {
            return res.status(404).json(formatResponse(false, 'User not found'));
        }

        const plan = await InvestmentPlan.findById(planId);
        if (!plan) {
            return res.status(404).json(formatResponse(false, 'Investment plan not found'));
        }

        if (decimalAmount.lessThan(plan.minAmount)) {
            return res.status(400).json(formatResponse(false, `Amount must be at least ${plan.minAmount}`));
        }

        const wallet = await Wallet.findOne({ userId: userId });
        if (!wallet) {
            return res.status(404).json(formatResponse(false, 'User wallet not found'));
        }

        const currentBalance = new Decimal(wallet.balances[investmentCurrency] || 0);

        if (currentBalance.lessThan(decimalAmount)) {
            return res.status(402).json(formatResponse(false, `Insufficient ${investmentCurrency} balance`));
        }

        const newInvestment = new Investment({
            userId: userId, // Use userId as per your Investment model
            planId: planId, // Use planId as per your Investment model
            amountInvested: decimalAmount.toNumber(), // Use amountInvested as per your Investment model
            status: 'active', // Default status
        });

        const session = await mongoose.startSession();
        session.startTransaction();

        try {
            wallet.balances[investmentCurrency] = currentBalance.minus(decimalAmount).toNumber();
            await wallet.save({ session });
            await newInvestment.save({ session });

            await session.commitTransaction();
            session.endSession();

            res.status(201).json(formatResponse(true, 'Investment started successfully', {
                investmentId: newInvestment._id.toString(), // Use _id from the created Investment
                plan: plan.name, // Get plan name from the fetched InvestmentPlan
                amount: newInvestment.amountInvested,
                roi: plan.roi,
                duration: plan.duration,
                status: newInvestment.status,
                startDate: newInvestment.createdAt, // Or set a specific start date
                endDate: calculateEndDate(new Date(), plan.duration), // Implement this
            }));

        } catch (transactionError) {
            await session.abortTransaction();
            session.endSession();
            logger.error('Investment transaction error: ' + transactionError.message);
            return res.status(500).json(formatResponse(false, 'Error processing investment transaction', { error: transactionError.message }));
        }

    } catch (error) {
        logger.error('Investment error: ' + error.message);
        res.status(500).json(formatResponse(false, 'Error processing investment', { error: error.message }));
    }
};

exports.getInvestmentDetails = async (req, res) => {
    try {
        const investment = await Investment.findOne({ _id: req.params.id, userId: req.user.id })
            .populate('planId', 'name'); // Populate plan details

        if (!investment) {
            return res.status(404).json({ success: false, message: 'Investment not found' });
        }

        const investmentDetails = {
            _id: investment._id.toString(),
            user: investment.userId.toString(),
            amount: investment.amountInvested,
            plan: investment.planId ? investment.planId.name : 'N/A',
            status: investment.status,
            startDate: investment.createdAt,
            endDate: calculateEndDate(investment.createdAt, investment.planId ? investment.planId.duration : 'N/A'), // Need duration
            roiHistory: [], // Your model doesn't have this
            createdAt: investment.createdAt,
            updatedAt: investment.updatedAt,
        };

        res.json({ success: true, investment: investmentDetails });
    } catch (err) {
        logger.error('Error fetching investment details: ' + err.message);
        res.status(500).json({ success: false, message: 'Server error', error: err.message });
    }
};

exports.cancelInvestment = async (req, res) => {
    try {
        const investment = await Investment.findOne({ _id: req.params.id, userId: req.user.id });

        if (!investment) {
            return res.status(404).json({ success: false, message: 'Investment not found' });
        }

        if (investment.status !== 'active') {
            return res.status(400).json({ success: false, message: 'Only active investments can be cancelled' });
        }

        investment.status = 'cancelled';
        await investment.save();

        res.json({
            success: true,
            message: 'Investment cancelled',
            investment: {
                _id: investment._id.toString(),
                status: investment.status,
            },
        });
    } catch (err) {
        logger.error('Error cancelling investment: ' + err.message);
        res.status(500).json({ success: false, message: 'Server error', error: err.message });
    }
};
