import mongoose from 'mongoose';

const batchSchema = new mongoose.Schema({
  batchId: { type: String, unique: true },
  programInternalId: String, // optional, which program this batch belongs to
  status: { type: String, enum: ['in_storage', 'in_transit', 'distributed'], default: 'in_storage' },
  items: [{
    itemId: String,
    name: String,
    remaining: Number,
    total: Number,
    unit: String
  }],
  lastUpdated: { type: Date, default: Date.now }
});

batchSchema.pre('save', function() {
  if (!this.batchId) {
    this.batchId = 'batch_' + Date.now() + '_' + Math.floor(Math.random() * 1000);
  }
  this.lastUpdated = new Date();
});

export default mongoose.model('Batch', batchSchema);