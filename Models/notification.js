import mongoose from 'mongoose';

const notificationSchema = new mongoose.Schema(
  {
    user: { 
      type: mongoose.Schema.Types.ObjectId, 
      ref: 'User',
      required: true 
    },
    type: {
      type: String,
      enum: [
        'payment', 
        'kyc', 
        'withdrawal',
        'investment',
        'system'
      ],
      required: true
    },
    title: {
      type: String,
      required: true
    },
    message: {
      type: String,
      required: true
    },
    isRead: {
      type: Boolean,
      default: false
    },
    metadata: mongoose.Schema.Types.Mixed
  }, 
  { 
    timestamps: true,
    toJSON: { virtuals: true }
  }
);

// Index for faster queries
notificationSchema.index({ user: 1, isRead: 1 });

export default mongoose.model('Notification', notificationSchema);