const mongoose = require('mongoose');

const archiveUserSchema = new mongoose.Schema({
  originalId: {
    type: mongoose.Schema.Types.ObjectId,
    required: true
  },
  email: {
    type: String,
    required: true,
    index: true
  },
  deletedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  deletionReason: String,
  userData: mongoose.Schema.Types.Mixed,
  deletedAt: {
    type: Date,
    default: Date.now
  }
}, {
  timestamps: true,
  toJSON: { virtuals: true }
});

module.exports = mongoose.model('ArchiveUser', archiveUserSchema);
