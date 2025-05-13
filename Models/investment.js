// models/Investment.js
const mongoose = require('mongoose');
const { Schema } = mongoose;

const investmentSchema = new Schema({
  userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  planId: { type: Schema.Types.ObjectId, ref: 'InvestmentPlan', required: true },
  amountInvested: { type: Number, required: true },
  status: { type: String, default: 'active' },
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now },
});

const Investment = mongoose.model('Investment', investmentSchema);

module.exports = Investment;
