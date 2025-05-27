import mongoose from 'mongoose';

const CurrencySchema = new mongoose.Schema(
  {
    symbol: {
      type: String,
      required: true,
      unique: true,
      uppercase: true,
      trim: true,
    },
    name: {
      type: String,
      required: true,
      trim: true,
    },
    isActive: {
      type: Boolean,
      default: true,
    },
    logoUrl: {
      type: String,
      trim: true,
    },
    // Add other relevant fields as needed in the future
  },
  { timestamps: true } // Optionally add timestamps for createdAt and updatedAt
);

const Currency = mongoose.model('Currency', CurrencySchema);

export default Currency;