import mongoose from 'mongoose';

const investmentPlanSchema = new mongoose.Schema(
  {
    name: { type: String, required: true },
    minAmount: { type: Number, required: true },
    roi: { type: Number, required: true },
    duration: { type: String, required: true },
    status: { type: String, default: 'available' },
    createdAt: { type: Date, default: Date.now },
    updatedAt: { type: Date, default: Date.now },
  },
  { timestamps: true } // Automatically manages `createdAt` and `updatedAt`
);

const InvestmentPlan = mongoose.model('InvestmentPlan', investmentPlanSchema);

export default InvestmentPlan;