import mongoose from 'mongoose';

const offlineQueueSchema = new mongoose.Schema({
  actionType: { 
    type: String, 
    enum: ['register', 'claim'], 
    required: true 
  },
  payload: { type: mongoose.Schema.Types.Mixed, required: true },
  status: { 
    type: String, 
    enum: ['pending', 'processing', 'completed', 'failed'], 
    default: 'pending' 
  },
  createdAt: { type: Date, default: Date.now },
  processedAt: Date,
  retryCount: { type: Number, default: 0 },
  error: String,
  txHash: String
});

offlineQueueSchema.index({ status: 1, createdAt: 1 });

export default mongoose.model('OfflineQueue', offlineQueueSchema);
