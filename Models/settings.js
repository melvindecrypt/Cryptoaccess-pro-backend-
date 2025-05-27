import mongoose from 'mongoose';

const settingsSchema = new mongoose.Schema(
  {
    accessFee: { type: Number, default: 99.9 },
    proPlusFee: { type: Number, default: 299.99 },
    investmentMin: { type: Number, default: 500 },
    investmentMax: { type: Number, default: 100000 },
    withdrawalsEnabled: { type: Boolean, default: true },
  },
  { timestamps: true } // Optionally add timestamps for tracking changes
);

export default mongoose.model('Settings', settingsSchema);