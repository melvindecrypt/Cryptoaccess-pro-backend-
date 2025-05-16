const User = require('../models/User');
const { formatResponse } = require('../utils/helpers');
const logger = require('../utils/logger');
const { generateUniqueReferralCode } = require('../utils/referralUtils'); // Assuming you have this utility
const emailService = require('../services/emailService'); // Assuming you have an email service

const REFERRAL_REWARD_AMOUNT = 100; // Define the referral reward amount

exports.getReferralInfo = async (req, res) => {
  try {
    const user = await User.findById(req.user._id).populate({
      path: 'referralUsers',
      select: 'email createdAt accessPaymentCompleted proPlusStatus', // Select relevant fields
    });

    if (!user) {
      return res.status(404).json(formatResponse(false, 'User not found'));
    }

    const referralLink = `${process.env.APP_URL}/register?ref=${user.referralCode}`;
    let totalEarned = 0;
    let pendingReferralsCount = 0;
    let approvedReferralsCount = 0;

    const referredUsersData = user.referrals.map((referredUser) => {
      let referralStatus = 'signed up';
      let earnedAmount = 0;

      if (referredUser.accessPaymentCompleted && referredUser.proPlusStatus) {
        referralStatus = 'approved';
        earnedAmount = REFERRAL_REWARD_AMOUNT;
        approvedReferralsCount++;
        totalEarned += REFERRAL_REWARD_AMOUNT;
      } else if (!referredUser.accessPaymentCompleted) {
        referralStatus = 'payment pending';
        pendingReferralsCount++;
      } else if (referredUser.accessPaymentCompleted && !referredUser.proPlusStatus) {
        referralStatus = 'active'; // Or another status before Pro+
      }

      return {
        email: referredUser.email,
        signupDate: referredUser.createdAt,
        referralStatus: referralStatus,
        earnedAmount: earnedAmount,
      };
    });

    res.json(
      formatResponse(true, 'Referral information retrieved successfully', {
        referral_code: user.referralCode,
        referralLink: referralLink,
        total_referrals: user.referrals.length,
        total_earned: totalEarned,
        pending_referrals_count: pendingReferralsCount,
        approved_referrals_count: approvedReferralsCount,
        referred_users: referredUsersData,
        referral_reward_amount: REFERRAL_REWARD_AMOUNT, // Optionally include the reward amount
      })
    );
  } catch (error) {
    logger.error(`Error fetching referral info for user ${req.user._id}: ${error.message}`);
    res.status(500).json(formatResponse(false, 'Failed to retrieve referral information'));
  }
};

exports.shareReferralLink = async (req, res) => {
  try {
    const { recipient_email } = req.body;
    const user = await User.findById(req.user._id);

    if (!user) {
      return res.status(404).json(formatResponse(false, 'User not found'));
    }

    const referralLink = `${process.env.APP_URL}/register?ref=${user.referralCode}`;

    if (recipient_email) {
      // Assuming emailService.sendReferralEmail(recipientEmail, referralLink, referrerName) exists
      await emailService.sendReferralEmail(recipient_email, referralLink, user.email);
      return res.json(
        formatResponse(true, 'Referral link shared successfully')
      );
    }

    // Handle other sharing methods here if implemented
    res.json(formatResponse(true, 'Referral link generated', { referralLink }));

  } catch (error) {
    logger.error(`Error sharing referral link for user ${req.user._id}: ${error.message}`);
    res.status(500).json(formatResponse(false, 'Failed to share referral link'));
  }
};
