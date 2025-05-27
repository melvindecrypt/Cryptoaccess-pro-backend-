import mongoose from 'mongoose';

const auditLogSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      index: true,
    },
    ipAddress: String,
    userAgent: String,
    action: {
      type: String,
      required: true,
      enum: [
        'login',
        'logout',
        'kyc_upload',
        'password_change',
        'withdrawal_request',
        'admin_action',
      ],
    },
    entityType: String, // e.g., 'User', 'Withdrawal'
    entityId: mongoose.Schema.Types.ObjectId,
    metadata: mongoose.Schema.Types.Mixed,
    status: {
      type: String,
      enum: ['success', 'failed'],
      default: 'success',
    },
  },
  {
    timestamps: true,
    toJSON: { virtuals: true },
  }
);

// Compound index for faster queries
auditLogSchema.index({ userId: 1, action: 1, createdAt: -1 });

export default mongoose.model('AuditLog', auditLogSchema);