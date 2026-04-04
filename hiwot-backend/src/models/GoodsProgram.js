import mongoose from 'mongoose';

const goodsProgramSchema = new mongoose.Schema({
  internalId: { type: String, unique: true },
  programId: { type: String, unique: true, sparse: true },
  organizationWallet: { type: String, required: true },
  title: { type: String, required: true },
  inventory: [{
    itemId: String,
    name: String,
    unit: String,
    quantityAvailable: Number,
    totalQuantity: Number,
    batchNumber: String,
    expiryDate: Date,
    shipmentId: String
  }],
  location: { lat: Number, lng: Number },
  geofence: mongoose.Schema.Types.Mixed,
  deadline: { type: Date, required: true },
  totalClaims: { type: Number, default: 0 },
  active: { type: Boolean, default: true },
  createdAt: { type: Date, default: Date.now },
  synced: { type: Boolean, default: false },
  txHash: String
});

goodsProgramSchema.pre('save', function() {
  if (!this.internalId) {
    this.internalId = 'goods_' + Date.now() + '_' + Math.floor(Math.random() * 1000);
  }
}, { timestamps: true });

export default mongoose.model('GoodsProgram', goodsProgramSchema);
