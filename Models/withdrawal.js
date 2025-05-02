// File: models/Withdrawal.js
const mongoose = require('mongoose');
const { formatResponse } = require('../utils/helpers');

const withdrawalSchema = new mongoose.Schema({
  user: { 
    type: mongoose.Schema.Types.ObjectId, 
    ref: 'User',
    required: true 
  },
  currency: {
    type: String,
    required: true,
    uppercase: true
  },
  amount: {
    type: Number,
    required: true,
    min: 0.00000001
  },
  destinationAddress: {
    type: String,
    required: true
  },
  status: {
    type: String,
    enum: ['pending', 'approved', 'rejected', 'processed'],
    default: 'pending'
  },
  adminNotes: String,
  processedAt: Date,
  transactionHash: String
}, { 
  timestamps: true,
  toJSON: { virtuals: true }
});

module.exports = mongoose.model('Withdrawal', withdrawalSchema);

whitelistedAddress: {
     type: Boolean,
     default: false,
     validate: {
       validator: function(v) {
         return !(this.status === 'approved' && !v);
       },
       message: 'Only whitelisted addresses can be approved'
     }
   }
