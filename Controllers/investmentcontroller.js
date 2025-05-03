const User = require('../models/User');
const { formatResponse } = require('../utils/helpers');
const logger = require('../utils/logger');
const Decimal = require('decimal.js');  // Import decimal.js

// View available investment plans
exports.viewPlans = async (req, res) => {
  try {
    // Example of available investment plans
    const plans = [
      { id: 1, name: 'Plan A', minAmount: new Decimal(500), maxAmount: new Decimal(10000), roi: new Decimal(20), duration: '6 months' },
      { id: 2, name: 'Plan B', minAmount: new Decimal(1000), maxAmount: new Decimal(50000), roi: new Decimal(25), duration: '12 months' }
    ];

    res.json(formatResponse(true, 'Investment plans fetched successfully', plans));
  } catch (error) {
    logger.error('Error fetching plans: ' + error.message);
    res.status(500).json(formatResponse(false, 'Error fetching investment plans', { error: error.message }));
  }
};

// Make an Investment (Requires KYC)
exports.invest = async (req, res) => {
  const { planId, amount } = req.body;
  const userId = req.user._id;

  try {
    // Validate input
    if (!planId || typeof amount !== 'number' || amount <= 0) {
      return res.status(400).json(formatResponse(false, 'Valid plan ID and amount required'));
    }

    // Convert amount to Decimal
    const decimalAmount = new Decimal(amount);

    // Fetch user 
    const user = await User.findById(userId);
    }

    // Fetch investment plans (mocked for now)
    const plans = [
      { id: 1, name: 'Plan A', minAmount: new Decimal(500), maxAmount: new Decimal(10000), roi: new Decimal(20), duration: '6 months' },
      { id: 2, name: 'Plan B', minAmount: new Decimal(1000), maxAmount: new Decimal(50000), roi: new Decimal(25), duration: '12 months' }
    ];

    const plan = plans.find(p => p.id === planId);
    if (!plan) {
      return res.status(404).json(formatResponse(false, 'Investment plan not found'));
    }

    // Check if the amount is within the allowed range using Decimal.js
    if (decimalAmount.lessThan(plan.minAmount) || decimalAmount.greaterThan(plan.maxAmount)) {
      return res.status(400).json(formatResponse(false, `Amount must be between ${plan.minAmount} and ${plan.maxAmount}`));
    }

    // Calculate the expected ROI using Decimal.js
    const roiAmount = decimalAmount.times(plan.roi).dividedBy(100); // ROI calculation with precision

    // Simulate the investment process
    const investment = {
      planId,
      amount: decimalAmount.toString(),  // Store as string to preserve precision
      roi: roiAmount.toString(),         // Store as string to preserve precision
      duration: plan.duration,
      startDate: new Date(),
      status: 'ACTIVE'
    };

    // Update user with investment details (you could also store it in a separate investments model)
    user.investments.push(investment);
    await user.save();

    res.json(formatResponse(true, 'Investment started successfully', investment));
  } catch (error) {
    logger.error('Investment error: ' + error.message);
    res.status(500).json(formatResponse(false, 'Error processing investment', { error: error.message }));
  }
};

// Track user's investments
exports.trackInvestment = async (req, res) => {
  const userId = req.user._id;

  try {
    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json(formatResponse(false, 'User not found'));
    }

    res.json(formatResponse(true, 'User investments fetched successfully', user.investments || []));
  } catch (error) {
    logger.error('Tracking investment error: ' + error.message);
    res.status(500).json(formatResponse(false, 'Error tracking investment', { error: error.message }));
  }
};