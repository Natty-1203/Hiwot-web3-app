import mongoose from 'mongoose';

const distributionSchema = new mongoose.Schema({
  distributionId: { type: String, unique: true },
  nullifier: { type: String, required: true, index: true },
  programInternalId: { type: String, required: true, index: true },
  type: { type: String, enum: ['cash', 'goods'], required: true },
  amount: Number, // for cash, in USD
  itemId: String, // for goods
  quantity: Number,
  batchNumber: String,
  agentWallet: { type: String, required: true },
  location: { lat: Number, lng: Number },
  timestamp: { type: Date, default: Date.now },
  status: { type: String, enum: ['confirmed', 'pending', 'failed'], default: 'confirmed' },
  txHash: String, // optional, if recorded on-chain
  syncStatus: { type: String, enum: ['synced', 'pending'], default: 'synced' }
});

distributionSchema.pre('save', function() {
  if (!this.distributionId) {
    this.distributionId = 'dist_' + Date.now() + '_' + Math.floor(Math.random() * 1000);
  }
});

export default mongoose.model('Distribution', distributionSchema);