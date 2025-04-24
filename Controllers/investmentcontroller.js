const User = require('../models/User');
const { formatResponse } = require('../utils/helpers');
const logger = require('../utils/logger');

// View available investment plans
exports.viewPlans = async (req, res) => {
  try {
    // Example of available investment plans
    const plans = [
      { id: 1, name: 'Plan A', minAmount: 500, maxAmount: 10000, roi: 20, duration: '6 months' },
      { id: 2, name: 'Plan B', minAmount: 1000, maxAmount: 50000, roi: 25, duration: '12 months' }
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

    // Fetch user and check KYC status
    const user = await User.findById(userId);
    if (user.kycStatus !== 'approved') {
      return res.status(403).json(formatResponse(false, 'KYC not approved'));
    }

    // Fetch investment plans (mocked for now)
    const plans = [
      { id: 1, name: 'Plan A', minAmount: 500, maxAmount: 10000, roi: 20, duration: '6 months' },
      { id: 2, name: 'Plan B', minAmount: 1000, maxAmount: 50000, roi: 25, duration: '12 months' }
    ];

    const plan = plans.find(p => p.id === planId);
    if (!plan) {
      return res.status(404).json(formatResponse(false, 'Investment plan not found'));
    }

    if (amount < plan.minAmount || amount > plan.maxAmount) {
      return res.status(400).json(formatResponse(false, 'Amount must be within the plan\'s limits'));
    }

    // Simulate the investment process
    const investment = {
      planId,
      amount,
      roi: plan.roi,
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