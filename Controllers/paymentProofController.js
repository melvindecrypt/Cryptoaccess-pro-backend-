const User = require('../models/user');
const Transaction = require('../models/transaction');
const PaymentProof = require('../models/paymentProof'); // Import the PaymentProof model
const { ACCESS_FEE_USD } = require('../config/constants');
const {
  BTC_WALLET_ADDRESS,
  ETH_WALLET_ADDRESS,
  SOL_WALLET_ADDRESS,
  BNB_WALLET_ADDRESS,
  USDT_ERC20_WALLET_ADDRESS,
  USDC_ERC20_WALLET_ADDRESS,
  DAI_WALLET_ADDRESS,
  XRP_WALLET_ADDRESS,
  DOGE_WALLET_ADDRESS,
  TRX_WALLET_ADDRESS,
  USDT_TRC20_WALLET_ADDRESS,
  LTC_WALLET_ADDRESS,
  MNT_WALLET_ADDRESS,
} = require('../config/walletAddresses');

exports.initiateAccessFee = async (req, res) => {
  try {
    const userId = req.user.id;

    res.status(200).json({
      success: true,
      message: 'Initiate access fee payment.',
      fee: ACCESS_FEE_USD,
      paymentAddresses: {
        BTC: BTC_WALLET_ADDRESS,
        ETH: ETH_WALLET_ADDRESS,
        SOL: SOL_WALLET_ADDRESS,
        BNB: BNB_WALLET_ADDRESS,
        'USDT (ERC20)': USDT_ERC20_WALLET_ADDRESS,
        'USDC (ERC20)': USDC_ERC20_WALLET_ADDRESS,
        DAI: DAI_WALLET_ADDRESS,
        XRP: XRP_WALLET_ADDRESS,
        DOGE: DOGE_WALLET_ADDRESS,
        TRX: TRX_WALLET_ADDRESS,
        'USDT (TRC20)': USDT_TRC20_WALLET_ADDRESS,
        LTC: LTC_WALLET_ADDRESS,
        MNT: MNT_WALLET_ADDRESS,
        instructions: `Pay ${ACCESS_FEE_USD} USD equivalent in your chosen cryptocurrency to the address below and upload proof of payment.`
      },
      user: {
        id: userId,
      },
    });
  } catch (error) {
    console.error('Initiate access fee error:', error);
    res.status(500).json({
      success: false,
      error: 'Server Error',
      message: error.message,
    });
  }
};

exports.uploadPaymentProof = async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ success: false, message: 'No payment proof uploaded.' });
    }

    const userId = req.user.id;
    const fileURL = `/uploads/paymentProofs/${req.file.filename}`; // Adjust path if needed

    const paymentProof = new PaymentProof({
      userId: userId,
      amount: ACCESS_FEE_USD, // Assuming fixed fee
      currency: 'USD',
      proofUrl: fileURL,
      status: 'pending',
    });
    await paymentProof.save();

    res.status(201).json({
      success: true,
      message: 'Payment proof uploaded successfully. Awaiting verification.',
      proofId: paymentProof._id,
      status: 'pending',
    });

  } catch (error) {
    console.error('Upload payment proof error:', error);
    res.status(500).json({ success: false, message: 'Server error.', error: error.message });
  }
};

exports.getAllPaymentProofs = async (req, res) => {
    try {
        const { paymentType, status, email, page = 1, limit = 20 } = req.query;
        const query = {};

        if (paymentType) query.paymentType = paymentType;
        if (status) query.status = status;

        // Step 1: Lookup users by email if provided
        if (email) {
            const users = await User.find({ email: { $regex: email, $options: 'i' } }, '_id');
            query.userId = { $in: users.map(user => user._id) };
        }

        const skip = (page - 1) * limit;

        const [paymentProofs, total] = await Promise.all([
            PaymentProof.find(query)
                .populate('userId', 'email')
                .sort({ createdAt: -1 })
                .skip(skip)
                .limit(Number(limit)),
            PaymentProof.countDocuments(query)
        ]);

        res.status(200).json({
            success: true,
            paymentProofs,
            pagination: {
                total,
                page: Number(page),
                limit: Number(limit),
                pages: Math.ceil(total / limit)
            }
        });
    } catch (error) {
        console.error('Error fetching payment proofs:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to fetch payment proofs.',
            error: error.message
        });
    }
};
exports.updateProofStatus = async (req, res) => {
    try {
        const { id } = req.params;
        const { status } = req.body;

        const paymentProof = await PaymentProof.findByIdAndUpdate(id, { status, updatedAt: Date.now() }, { new: true });

        if (!paymentProof) {
            return res.status(404).json({ success: false, message: 'Payment proof not found.' });
        }

        if (status === 'approved') {
            const user = await User.findByIdAndUpdate(paymentProof.userId, { accessStatus: 'granted' });
            if (!user) {
                console.error('Error updating user access status.');
            }
        }

        res.status(200).json({ success: true, message: `Payment proof status updated to ${status}`, paymentProof });
    } catch (error) {
        console.error('Error updating payment proof status:', error);
        res.status(500).json({ success: false, message: 'Failed to update payment proof status.', error: error.message });
    }
};

// --- Pro+ Subscription Endpoints (New) ---
exports.initiateProPlusPayment = async (req, res) => {
  try {
    const userId = req.user.id;

    res.status(200).json({
      success: true,
      message: 'Initiate Pro+ subscription payment.',
      fee: PRO_PLUS_FEE_USD,
      paymentAddresses: {
        BTC: BTC_WALLET_ADDRESS,
        ETH: ETH_WALLET_ADDRESS,
        SOL: SOL_WALLET_ADDRESS,
        BNB: BNB_WALLET_ADDRESS,
        'USDT (ERC20)': USDT_ERC20_WALLET_ADDRESS,
        'USDC (ERC20)': USDC_ERC20_WALLET_ADDRESS,
        DAI: DAI_WALLET_ADDRESS,
        XRP: XRP_WALLET_ADDRESS,
        DOGE: DOGE_WALLET_ADDRESS,
        TRX: TRX_WALLET_ADDRESS,
        'USDT (TRC20)': USDT_TRC20_WALLET_ADDRESS,
        LTC: LTC_WALLET_ADDRESS,
        MNT: MNT_WALLET_ADDRESS,
        instructions: `Pay ${PRO_PLUS_FEE_USD} USD equivalent in your chosen cryptocurrency to the address below and upload proof of payment for Pro+ subscription.`
      },
      user: {
        id: userId,
      },
    });
  } catch (error) {
    console.error('Initiate Pro+ payment error:', error);
    res.status(500).json({
      success: false,
      error: 'Server Error',
      message: error.message,
    });
  }
};

exports.uploadProPlusPaymentProof = async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ success: false, message: 'No Pro+ payment proof uploaded.' });
    }

    const userId = req.user.id;
    const fileURL = `/uploads/proPlusProofs/${req.file.filename}`; // Separate upload directory

    const paymentProof = new PaymentProof({
      userId: userId,
      amount: PRO_PLUS_FEE_USD,
      currency: 'USD',
      proofUrl: fileURL,
      status: 'pending',
      paymentType: 'pro-plus' // Identify as Pro+ payment
    });
    await paymentProof.save();

    res.status(201).json({
      success: true,
      message: 'Pro+ payment proof uploaded successfully. Awaiting verification.',
      proofId: paymentProof._id,
      status: 'pending',
      paymentType: 'pro-plus',
    });

  } catch (error) {
    console.error('Upload Pro+ payment proof error:', error);
    res.status(500).json({ success: false, message: 'Server error.', error: error.message });
  }
};

exports.getPendingProPlusPayments = async (req, res) => {
    try {
        const pendingProPlusProofs = await PaymentProof.find({ status: 'pending', paymentType: 'pro-plus' }).populate('userId', 'email');
        res.status(200).json({ success: true, pendingProPlusProofs });
    } catch (error) {
        console.error('Error fetching pending Pro+ payments:', error);
        res.status(500).json({ success: false, message: 'Failed to fetch pending Pro+ payments.', error: error.message });
    }
};

exports.updateProofStatus = async (req, res) => {
    try {
        const { id } = req.params;
        const { status } = req.body;

        // --- Add this validation ---
        const validStatuses = ['approved', 'rejected'];
        if (!status || !validStatuses.includes(status)) {
            return res.status(400).json({ success: false, message: 'Invalid status value. Expected "approved" or "rejected".' });
        }

        const paymentProof = await PaymentProof.findByIdAndUpdate(id, { status, updatedAt: Date.now() }, { new: true });

        if (!paymentProof) {
            return res.status(404).json({ success: false, message: 'Payment proof not found.' });
        }

        if (status === 'approved' && paymentProof.paymentType === 'pro-plus') {
            const user = await User.findById(paymentProof.userId);
            if (!user) {
                console.error('Error finding user for Pro+ approval for proof ID:', id);
    // Abort transaction if you were using one here, although updateOne/findById doesn't need it
    return res.status(500).json({ success: false, message: 'Internal error: Could not find user associated with proof.' });
}
  }
            user.subscription = {
                isProPlus: true,
                subscribedAt: new Date(),
                expiresAt: new Date(Date.now() + PRO_PLUS_SUBSCRIPTION_DURATION_DAYS * 24 * 60 * 60 * 1000),
                paymentStatus: 'verified',
                paymentEvidence: { proofId: paymentProof._id, proofUrl: paymentProof.proofUrl }
            };
            user.subscriptionHistory.push({
                startDate: user.subscription.subscribedAt,
                endDate: user.subscription.expiresAt,
                verifiedBy: req.user._id, // Assuming admin user is in req.user
                paymentEvidence: { proofId: paymentProof._id, proofUrl: paymentProof.proofUrl }
            });
            await user.save();
        } else if (status === 'approved' && paymentProof.paymentType !== 'pro-plus') {
            const user = await User.findByIdAndUpdate(paymentProof.userId, { accessStatus: 'granted' });
            if (!user) {
                console.error('Error updating user access status.');
            }
        }

        res.status(200).json({ success: true, message: `Payment proof status updated to ${status}`, paymentProof });
    } catch (error) {
        console.error('Error updating payment proof status:', error);
        res.status(500).json({ success: false, message: 'Failed to update payment proof status.', error: error.message });
    }
};
