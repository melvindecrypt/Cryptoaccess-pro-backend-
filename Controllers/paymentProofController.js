const User = require('../models/User');
const Transaction = require('../models/Transaction');
const PaymentProof = require('../models/PaymentProof'); // Import the PaymentProof model
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
      message: 'Payment proof uploaded successfully. Awaiting admin verification.',
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
        const paymentProofs = await PaymentProof.find().populate('userId', 'email'); // Populate user email
        res.status(200).json({ success: true, paymentProofs });
    } catch (error) {
        console.error('Error fetching payment proofs:', error);
        res.status(500).json({ success: false, message: 'Failed to fetch payment proofs.', error: error.message });
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
