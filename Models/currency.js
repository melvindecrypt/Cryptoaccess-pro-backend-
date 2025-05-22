const mongoose = require('mongoose');

const CurrencySchema = new mongoose.Schema({
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
});

const Currency = mongoose.model('Currency', CurrencySchema);

module.exports = Currency;
