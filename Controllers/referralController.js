import User from '../models/user.js';
import { formatResponse } from '../utils/helpers.js';
import logger from '../utils/logger.js';
import emailService from '../services/emailService.js';

const REFERRAL_REWARD_AMOUNT = 100; // Define the referral reward amount

// Get Referral Info
export const getReferralInfo = async (req, res) => {
  try {
    const user = await User.findById(req.user._id).populate({
      path: 'referredUsers',
      select: 'email createdAt accessPaymentCompleted proPlusStatus', // Select relevant fields
    });

    if (!user) {
      return res.status(404).json(formatResponse(false, 'User not found'));
    }

    const referralLink = `${process.env.APP_URL}/register?ref=${user.referralCode}`;
    let totalEarned = 0;
    let pendingReferralsCount = 0;
    let approvedReferralsCount = 0;

    const referredUsersData = user.referredUsers.map((referredUser) => {
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
        total_referrals: user.referredUsers.length,
        total_earned: totalEarned,
        pending_referrals_count: pendingReferralsCount,
        approved_referrals_count: approvedReferralsCount,
        referred_users: referredUsersData,
        referral_reward_amount: REFERRAL_REWARD_AMOUNT, // Optionally include the reward amount
      })
    );
  } catch (error) {
    logger.error(`Error fetching referral info for user ${req.user._id}: ${error.message}`);
    res.status(500).json(formatResponse(false, 'Failed to retrieve referral information', { error: error.message }));
  }
};

// Share Referral Link
export const shareReferralLink = async (req, res) => {
  try {
    const { recipient_email } = req.body;
    const user = await User.findById(req.user._id);

    if (!user) {
      return res.status(404).json(formatResponse(false, 'User not found'));
    }

    const referralLink = `${process.env.APP_URL}/register?ref=${user.referralCode}`;

    if (recipient_email) {
      try {
        await emailService.sendReferralEmail(recipient_email, referralLink, user.email);
        return res.json(formatResponse(true, 'Referral link shared successfully'));
      } catch (emailError) {
        logger.error(`Error sending referral email for user ${req.user._id} to ${recipient_email}: ${emailError.message}`);
        return res.status(500).json(formatResponse(false, 'Failed to send referral email', { error: emailError.message }));
      }
    }

    res.json(formatResponse(true, 'Referral link generated', { referralLink }));
  } catch (error) {
    logger.error(`Error sharing referral link for user ${req.user._id}: ${error.message}`);
    res.status(500).json(formatResponse(false, 'Failed to share referral link', { error: error.message }));
  }
};