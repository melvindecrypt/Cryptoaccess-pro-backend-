import mongoose from 'mongoose';

const PaymentProofSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    amount: { type: Number, required: true },
    currency: { type: String, required: true },
    proofUrl: { type: String, required: true },
    status: { 
      type: String, 
      enum: ['pending', 'approved', 'rejected'], 
      default: 'pending' 
    },
    paymentType: { 
      type: String, 
      enum: ['access-fee', 'pro-plus'], 
      default: 'access-fee' 
    }, // Added payment type
    createdAt: { type: Date, default: Date.now },
    updatedAt: { type: Date, default: Date.now },
  },
  { timestamps: true } // Automatically manages `createdAt` and `updatedAt`
);

export default mongoose.model('PaymentProof', PaymentProofSchema);