import mongoose from 'mongoose';

const adminWalletSchema = new mongoose.Schema({
  accessWallet: { type: String },
  proPlusWallet: { type: String },
  withdrawalWallet: { type: String },
});

export default mongoose.model('AdminWallet', adminWalletSchema);