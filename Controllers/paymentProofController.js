// controllers/paymentProofController.js
const PaymentProof = require('../models/PaymentProof');
const path = require('path');

exports.uploadPaymentProof = async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ message: 'No file uploaded' });
    }

    const proof = await PaymentProof.create({
      user: req.user._id,
      filePath: req.file.path
    });

    res.status(200).json({ message: 'Proof uploaded successfully', proof });
  } catch (err) {
    console.error('Upload error:', err);
    res.status(500).json({ message: 'Failed to upload proof' });
  }
};

exports.getAllPaymentProofs = async (req, res) => {
  try {
    const proofs = await PaymentProof.find().populate('user', 'email');
    res.status(200).json(proofs);
  } catch (err) {
    console.error('Fetch error:', err);
    res.status(500).json({ message: 'Error fetching proofs' });
  }
};

exports.updateProofStatus = async (req, res) => {
  try {
    const { status } = req.body;
    if (!['pending', 'approved', 'rejected'].includes(status)) {
      return res.status(400).json({ message: 'Invalid status value' });
    }

    const proof = await PaymentProof.findByIdAndUpdate(
      req.params.id,
      { status },
      { new: true }
    );

    if (!proof) {
      return res.status(404).json({ message: 'Proof not found' });
    }

    res.status(200).json({ message: 'Status updated', proof });
  } catch (err) {
    console.error('Update error:', err);
    res.status(500).json({ message: 'Update failed' });
  }
};
