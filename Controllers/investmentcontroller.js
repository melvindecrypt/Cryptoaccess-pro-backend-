const User = require('../models/user');
const Investment = require('../models/investment');
const InvestmentPlan = require('../models/investmentPlan'); // This model is crucial for defining plans
const Wallet = require('../models/wallet');
const { formatResponse } = require('../utils/helpers');
const { sendEmail } = require('../utils/emailService');
const logger = require('../utils/logger');
const Decimal = require('decimal.js');
const mongoose = require('mongoose');

// Helper function to calculate end date based on duration
function calculateEndDate(startDate, duration) {
    if (!startDate || typeof duration !== 'string') {
        return null; // Or throw an error, depending on desired behavior
    }
    const [value, unit] = duration.split(' ');
    const numValue = parseInt(value, 10);
    if (isNaN(numValue)) {
        logger.warn(`Invalid duration value: ${duration}`);
        return null;
    }

    const endDate = new Date(startDate);
    switch (unit.toLowerCase()) {
        case 'days':
            endDate.setDate(startDate.getDate() + numValue);
            break;
        case 'weeks':
            endDate.setDate(startDate.getDate() + (numValue * 7));
            break;
        case 'months':
            endDate.setMonth(startDate.getMonth() + numValue);
            break;
        case 'years':
            endDate.setFullYear(startDate.getFullYear() + numValue);
            break;
        default:
            logger.warn(`Unsupported duration unit: ${unit}`);
            return null;
    }
    return endDate;
}

// Helper function to determine investment name based on amount
function getInvestmentNameByAmount(amount) {
    if (amount >= 10000 && amount < 50000) {
        return `${amount} Alpha+`;
    } else if (amount >= 50000 && amount < 100000) {
        return `${amount} Beta Elite`;
    } else if (amount >= 100000 && amount < 500000) {
        return `${amount} Gamma Pro`;
    } else if (amount >= 500000) {
        return `${amount} Delta Supreme`;
    } else {
        return `${amount} Basic Tier`; // Default for smaller investments
    }
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

    const session = await mongoose.startSession();
    session.startTransaction();

    try {
        if (!planId || typeof amount !== 'number' || amount <= 0) {
            throw new Error('Valid plan ID and amount required');
        }

        const decimalAmount = new Decimal(amount);

        const user = await User.findById(userId).session(session);
        if (!user) {
            throw new Error('User not found');
        }

        const plan = await InvestmentPlan.findById(planId).session(session);
        if (!plan) {
            throw new Error('Investment plan not found');
        }

        if (decimalAmount.lessThan(plan.minAmount)) {
            throw new Error(`Amount must be at least ${plan.minAmount} ${investmentCurrency} for this plan.`);
        }

        const wallet = await Wallet.findOne({ userId: userId }).session(session);
        if (!wallet) {
            throw new Error('User wallet not found');
        }

        // Ensure wallet balance is a Decimal for arithmetic operations
        const currentBalance = new Decimal(wallet.balances.get(investmentCurrency) || 0);

        if (currentBalance.lessThan(decimalAmount)) {
            throw new Error(`Insufficient ${investmentCurrency} balance. Available: ${currentBalance.toFixed(2)}`);
        }

        // --- New Logic for Investment Details ---
        const investmentName = getInvestmentNameByAmount(decimalAmount.toNumber());
        const endDate = calculateEndDate(new Date(), plan.duration);

        const newInvestment = new Investment({
            userId: userId,
            planId: planId,
            amountInvested: decimalAmount.toNumber(),
            status: 'active',
            // Store calculated duration, ROI, and type directly for easy retrieval
            investmentType: investmentName, // Storing the dynamic name
            duration: plan.duration,
            roi: plan.roi,
            startDate: new Date(), // Explicitly set start date
            endDate: endDate, // Store calculated end date
        });

        // Update wallet balance using updateBalance method if available, otherwise direct Map update
        // Assuming wallet.balances is a Mongoose Map
        wallet.balances.set(investmentCurrency, currentBalance.minus(decimalAmount).toNumber());
        await wallet.save({ session });
        await newInvestment.save({ session });

        await session.commitTransaction();
        session.endSession();

        // Send email (consider making this non-blocking if possible)
        try {
            await sendEmail({
                to: user.email,
                subject: 'Investment Confirmed',
                template: 'investmentConfirmed', // looks for templates/emails/investmentConfirmed.hbs
                data: {
                    name: user.name,
                    amount: decimalAmount.toNumber(),
                    currency: investmentCurrency,
                    investmentName: investmentName, // Pass the dynamic name to email template
                    planName: plan.name,
                    roi: plan.roi,
                    duration: plan.duration,
                    startDate: newInvestment.startDate.toDateString(),
                    endDate: newInvestment.endDate ? newInvestment.endDate.toDateString() : 'N/A',
                }
            });
        } catch (emailError) {
            logger.error(`Failed to send investment confirmation email to ${user.email}: ${emailError.message}`);
            // Do not fail the entire API request if email fails, just log it.
        }

        res.status(201).json(formatResponse(true, 'Investment started successfully', {
            investmentId: newInvestment._id.toString(),
            investmentType: newInvestment.investmentType, // Return the dynamic name
            plan: plan.name, // Still useful to return the plan name
            amount: newInvestment.amountInvested,
            roi: newInvestment.roi,
            duration: newInvestment.duration,
            status: newInvestment.status,
            startDate: newInvestment.startDate,
            endDate: newInvestment.endDate,
        }));

    } catch (error) {
        await session.abortTransaction();
        session.endSession();
        logger.error(`Investment error for user ${userId}: ${error.message}`, error); // Log full error object
        res.status(400).json(formatResponse(false, error.message || 'An unexpected error occurred during the investment.'));
    }
};

exports.getInvestmentDetails = async (req, res) => {
    try {
        const investment = await Investment.findOne({ _id: req.params.id, userId: req.user.id })
            .populate('planId', 'name roi duration'); // Populate plan details

        if (!investment) {
            return res.status(404).json(formatResponse(false, 'Investment not found or does not belong to user'));
        }

        // Re-calculate end date in case the stored one is missing or outdated,
        // but primarily rely on the stored `endDate` from the `invest` function for consistency.
        const effectiveEndDate = investment.endDate || calculateEndDate(investment.createdAt, investment.duration);

        // Get the dynamic name again, or rely on the stored investmentType
        const dynamicInvestmentType = investment.investmentType || getInvestmentNameByAmount(investment.amountInvested);


        const investmentDetails = {
            _id: investment._id.toString(),
            user: investment.userId.toString(),
            amount: investment.amountInvested,
            // Prioritize the dynamically assigned type from the investment model if available
            investmentType: dynamicInvestmentType,
            plan: investment.planId ? investment.planId.name : 'N/A', // Plan name from populated data
            status: investment.status,
            startDate: investment.startDate, // Use stored startDate
            endDate: effectiveEndDate, // Use stored or calculated endDate
            roi: investment.roi, // Use stored ROI
            duration: investment.duration, // Use stored duration
            roiHistory: [], // Placeholder as per your comment, assuming no model field for this yet
            createdAt: investment.createdAt,
            updatedAt: investment.updatedAt,
        };

        res.json(formatResponse(true, 'Investment details fetched successfully', { investment: investmentDetails }));
    } catch (err) {
        logger.error(`Error fetching investment details for ID ${req.params.id}: ${err.message}`, err);
        res.status(500).json(formatResponse(false, 'Server error fetching investment details', { error: err.message }));
    }
};

exports.cancelInvestment = async (req, res) => {
    // Start a session for the cancellation if you need to revert balances
    // For now, it's a simple status update, but in a real scenario, you'd likely refund funds.
    const session = await mongoose.startSession();
    session.startTransaction();

    try {
        const investment = await Investment.findOne({ _id: req.params.id, userId: req.user.id }).session(session);

        if (!investment) {
            throw new Error('Investment not found or does not belong to user');
        }

        if (investment.status !== 'active') {
            throw new Error('Only active investments can be cancelled');
        }

        // --- Refund Logic (CRITICAL for a real system) ---
        // You would need to refund the original amount invested back to the user's wallet.
        // This should be done carefully, considering partial payouts, cancellation fees, etc.
        // For simplicity, we'll refund the full amount.

        const wallet = await Wallet.findOne({ userId: req.user.id }).session(session);
        if (!wallet) {
            throw new Error('User wallet not found for refund during cancellation');
        }

        const amountToRefund = new Decimal(investment.amountInvested);
        const investmentCurrency = 'USD'; // Assuming USD, ensure this matches the investment currency

        const currentBalance = new Decimal(wallet.balances.get(investmentCurrency) || 0);
        wallet.balances.set(investmentCurrency, currentBalance.plus(amountToRefund).toNumber());
        await wallet.save({ session });

        investment.status = 'cancelled';
        await investment.save({ session });

        await session.commitTransaction();
        session.endSession();

        // Optional: Send cancellation email
        const user = await User.findById(req.user.id);
        if (user) {
            try {
                await sendEmail({
                    to: user.email,
                    subject: 'Investment Cancelled',
                    template: 'investmentCancelled', // Create this template
                    data: {
                        name: user.name,
                        investmentId: investment._id.toString(),
                        amountRefunded: amountToRefund.toNumber(),
                        currency: investmentCurrency
                    }
                });
            } catch (emailError) {
                logger.error(`Failed to send investment cancellation email to ${user.email}: ${emailError.message}`);
            }
        }


        res.json(formatResponse(true, 'Investment cancelled and amount refunded successfully', {
            investmentId: investment._id.toString(),
            status: investment.status,
            refundedAmount: amountToRefund.toNumber(),
        }));
    } catch (err) {
        await session.abortTransaction();
        session.endSession();
        logger.error(`Error cancelling investment for ID ${req.params.id}: ${err.message}`, err);
        res.status(400).json(formatResponse(false, err.message || 'An unexpected error occurred during investment cancellation.'));
    }
};

// --- Daily ROI Payout Logic (Conceptual - needs to be triggered by a cron job or scheduled task) ---
// This function would typically NOT be an API endpoint but a background task.
// For demonstration, you could expose it as a temporary endpoint for manual triggering during development.
exports.processDailyROIPayouts = async () => {
    const session = await mongoose.startSession();
    session.startTransaction();

    try {
        const activeInvestments = await Investment.find({ status: 'active' })
            .populate('planId')
            .session(session);

        logger.info(`Processing daily ROI for ${activeInvestments.length} active investments.`);

        for (const investment of activeInvestments) {
            // Check if planId is populated and valid
            if (!investment.planId || !investment.planId.roi || !investment.planId.duration) {
                logger.warn(`Skipping investment ${investment._id} due to missing or invalid plan data.`);
                continue;
            }

            const currentROI = new Decimal(investment.planId.roi); // e.g., 0.01 for 1%
            const amountInvested = new Decimal(investment.amountInvested);
            const investmentCurrency = 'USD'; // Assuming USD, ensure consistency

            // Calculate daily ROI amount
            // Assuming annual ROI: (annual_roi / 365) * invested_amount
            // Assuming monthly ROI: (monthly_roi / 30) * invested_amount
            // Assuming plan.duration format is "X months" or "X days" or "X years"
            let dailyROI = new Decimal(0);
            const [durationValue, durationUnit] = investment.planId.duration.split(' ');

            if (durationUnit.toLowerCase() === 'months') {
                // Approximate daily ROI from monthly ROI: ROI / (Avg days in month) * amount
                // Or, if ROI is expressed as total for duration, calculate per day: total_roi / total_days
                // For simplicity, let's assume `roi` in InvestmentPlan is `monthly_roi`
                const daysInMonth = 30.4375; // Average days in a month
                dailyROI = amountInvested.times(currentROI.div(daysInMonth));
            } else if (durationUnit.toLowerCase() === 'years') {
                const daysInYear = 365;
                dailyROI = amountInvested.times(currentROI.div(daysInYear));
            } else if (durationUnit.toLowerCase() === 'days') {
                // If ROI is a daily percentage, use it directly
                dailyROI = amountInvested.times(currentROI);
            } else {
                 logger.warn(`Unsupported duration unit for ROI calculation: ${investment.planId.duration} for investment ${investment._id}`);
                 continue;
            }


            if (dailyROI.lessThanOrEqualTo(0)) {
                logger.warn(`Calculated daily ROI is zero or negative for investment ${investment._id}. Skipping payout.`);
                continue;
            }

            const wallet = await Wallet.findOne({ userId: investment.userId }).session(session);
            if (!wallet) {
                logger.error(`Wallet not found for user ${investment.userId} during ROI payout.`);
                continue; // Skip this investment but continue with others
            }

            const currentBalance = new Decimal(wallet.balances.get(investmentCurrency) || 0);
            wallet.balances.set(investmentCurrency, currentBalance.plus(dailyROI).toNumber());
            await wallet.save({ session });

            // Record ROI payout in transaction history (optional but highly recommended)
            // You might want a dedicated 'ROI' type transaction or a more detailed log.
            // For now, logging it as a generic 'credit' or 'payout' in a transaction collection.
            // Consider adding a 'payouts' sub-document to the Investment model itself.
            // For this example, we'll just log to console and assume a more robust system handles actual ROI history
            logger.info(`Paid ${dailyROI.toFixed(8)} ${investmentCurrency} ROI to user ${investment.userId} for investment ${investment._id}`);

            // You might want to update a lastPayoutDate on the investment or track total earned ROI
            // investment.lastPayoutDate = new Date();
            // investment.totalEarnedRoi = new Decimal(investment.totalEarnedRoi || 0).plus(dailyROI).toNumber();
            // await investment.save({ session });
        }

        await session.commitTransaction();
        logger.info('Daily ROI payouts processed successfully.');
        // This function doesn't send an HTTP response
    } catch (error) {
        await session.abortTransaction();
        logger.error(`Error during daily ROI payouts: ${error.message}`, error);
        // This function doesn't send an HTTP response
    } finally {
        session.endSession();
    }
};

// You might also want to expose an endpoint for a user to see their total investments
exports.getUserInvestments = async (req, res) => {
    try {
        const userId = req.user._id;
        const investments = await Investment.find({ userId: userId })
            .populate('planId', 'name roi duration'); // Populate plan details

        const formattedInvestments = investments.map(investment => {
            const effectiveEndDate = investment.endDate || calculateEndDate(investment.createdAt, investment.duration);
            const dynamicInvestmentType = investment.investmentType || getInvestmentNameByAmount(investment.amountInvested);

            return {
                _id: investment._id.toString(),
                amount: investment.amountInvested,
                investmentType: dynamicInvestmentType,
                plan: investment.planId ? investment.planId.name : 'N/A',
                status: investment.status,
                startDate: investment.startDate,
                endDate: effectiveEndDate,
                roi: investment.roi,
                duration: investment.duration,
                // roiHistory: [], // Still a placeholder
                createdAt: investment.createdAt,
                updatedAt: investment.updatedAt,
            };
        });

        res.json(formatResponse(true, 'User investments fetched successfully', { investments: formattedInvestments }));
    } catch (error) {
        logger.error(`Error fetching user investments for user ${req.user._id}: ${error.message}`, error);
        res.status(500).json(formatResponse(false, 'Server error fetching user investments', { error: error.message }));
    }
};
