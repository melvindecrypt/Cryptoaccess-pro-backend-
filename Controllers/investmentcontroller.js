const User = require('../models/user');
const Investment = require('../models/investment');
const InvestmentPlan = require('../models/investmentPlan');
const Wallet = require('../models/wallet');
const { formatResponse } = require('../utils/helpers');
const logger = require('../utils/logger');
const Decimal = require('decimal.js');
const mongoose = require('mongoose');

// Helper function to calculate end date based on duration
function calculateEndDate(startDate, duration) {
    const [value, unit] = duration.split(' ');
    const months = parseInt(value, 10);
    const endDate = new Date(startDate);
    endDate.setMonth(startDate.getMonth() + months);
    return endDate;
}

// View available investment plans
exports.viewPlans = async (req, res) => {
    try {
        const plans = await InvestmentPlan.find({ status: 'available' })
            .select('name minAmount roi duration _id');

        const formattedPlans = plans.map(plan => ({
            id: plan._id.toString(),
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

// Make an Investment (with balance check and transaction)
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
            userId: userId,
            planId: planId,
            amountInvested: decimalAmount.toNumber(),
            status: 'active',
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
                investmentId: newInvestment._id.toString(),
                plan: plan.name,
                amount: newInvestment.amountInvested,
                roi: plan.roi,
                duration: plan.duration,
                status: newInvestment.status,
                startDate: newInvestment.createdAt,
                endDate: calculateEndDate(new Date(), plan.duration),
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
            .populate('planId', 'name roi duration');

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
            endDate: calculateEndDate(investment.createdAt, investment.planId ? investment.planId.duration : 'N/A'),
            roi: investment.planId ? investment.planId.roi : null,
            duration: investment.planId ? investment.planId.duration : null,
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
