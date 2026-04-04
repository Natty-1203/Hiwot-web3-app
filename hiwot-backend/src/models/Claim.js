import mongoose from 'mongoose';

const claimSchema = new mongoose.Schema({
  nullifier: { type: String, required: true, index: true },
  programId: String,
  programInternalId: { type: String, required: true },
  claimType: { type: String, enum: ['cash', 'goods'], default: 'cash' },
  amount: Number,                     // in stroops
  timestamp: { type: Date, required: true },
  txHash: String,
  status: { type: String, enum: ['pending', 'completed', 'bank_pending', 'failed'], default: 'pending' },
  synced: { type: Boolean, default: false },

  // fields for the enhanced contract
  secret: { type: String },            // 32‑byte hex  required: true for on-chain
  commitment: { type: String, unique: true }, // hash(nullifier, programId, secret), required: true for on-chain
  disbursementMethod: { type: String, enum: ['Direct', 'ViaBank']},  // required: true for on-chain
  beneficiaryAddress: String,                           // Stellar address for Direct transfers

  // For goods claims (unchanged)
  itemId: String,
  quantity: Number,
  unit: String,
  batchNumber: String,
  expiryDate: Date,
  location: { lat: Number, lng: Number }
});

// Ensure one cash claim per program per beneficiary (but we already have unique on nullifier+program)
// However, with the commitment, we may need a different unique constraint. For cash claims,
// we want to prevent duplicate claims for the same program, so we keep the existing index.
claimSchema.index({ nullifier: 1, programInternalId: 1 }, { unique: true, partialFilterExpression: { claimType: 'cash' } });
claimSchema.index({ unique: true });

export default mongoose.model('Claim', claimSchema);
