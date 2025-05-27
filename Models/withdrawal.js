import mongoose from 'mongoose';
import { formatResponse } from '../utils/helpers.js';

const withdrawalSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    currency: {
      type: String,
      required: true,
      uppercase: true,
    },
    amount: {
      type: Number,
      required: true,
      min: 0.00000001,
    },
    destinationAddress: {
      type: String,
      required: true,
    },
    status: {
      type: String,
      enum: ['pending', 'approved', 'rejected', 'processed'],
      default: 'pending',
    },
    adminNotes: String,
    processedAt: Date,
    transactionHash: String,
    whitelistedAddress: {
      type: Boolean,
      default: false,
      validate: {
        validator: function (v) {
          return !(this.status === 'approved' && !v);
        },
        message: 'Only whitelisted addresses can be approved',
      },
    },
  },
  {
    timestamps: true,
    toJSON: { virtuals: true },
  }
);

export default mongoose.model('Withdrawal', withdrawalSchema);