const mongoose = require('mongoose');
const Schema = mongoose.Schema;

const PaymentProofSchema = new Schema({
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    amount: { type: Number, required: true },
    currency: { type: String, required: true },
    proofUrl: { type: String, required: true },
    status: { type: String, enum: ['pending', 'approved', 'rejected'], default: 'pending' },
    paymentType: { type: String, enum: ['access-fee', 'pro-plus'], default: 'access-fee' }, // Added payment type
    createdAt: { type: Date, default: Date.now },
    updatedAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model('PaymentProof', PaymentProofSchema);
