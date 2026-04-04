import mongoose from 'mongoose';

const cashProgramSchema = new mongoose.Schema({
  internalId: { type: String, unique: true },
  programId: { type: String, unique: true, sparse: true },
  organizationWallet: { type: String, required: true },
  title: { type: String, required: true },
  amountPerPerson: { type: Number, required: true },     // USD
  totalFunds: { type: Number, required: true },          // USD
  remainingFunds: { type: Number, required: true },
  location: { lat: Number, lng: Number },
  geofence: mongoose.Schema.Types.Mixed,
  deadline: { type: Date, required: true },
  totalClaims: { type: Number, default: 0 },
  active: { type: Boolean, default: true },
  createdAt: { type: Date, default: Date.now },
  synced: { type: Boolean, default: false },
  txHash: String,

  // New fields for contract
  disbursementMethod: { type: String, enum: ['Direct', 'ViaBank'] }, // required: true
  bankAddress: { type: String },               // Stellar address used for ViaBank
  tokenAddress: { type: String } // USDC token address on Stellar ,  required: true
});

cashProgramSchema.pre('save', function() {
  if (!this.internalId) {
    this.internalId = 'cash_' + Date.now() + '_' + Math.floor(Math.random() * 1000);
  }
}, { timestamps: true });

export default mongoose.model('CashProgram', cashProgramSchema);
