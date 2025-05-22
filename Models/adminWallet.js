const mongoose = require('mongoose');

const adminWalletSchema = new mongoose.Schema({
  accessWallet: { type: String },
  proPlusWallet: { type: String },
  withdrawalWallet: { type: String }
});

module.exports = mongoose.model('AdminWallet', adminWalletSchema);
