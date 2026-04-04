import mongoose from 'mongoose';

const mockBankTransactionSchema = new mongoose.Schema({
  commitment: { type: String, required: true, unique: true },
  nullifier: String,
  amountUSD: Number,
  amountETB: Number,
  exchangeRate: Number,
  programId: String,
  timestamp: { type: Date, default: Date.now },
  reference: { type: String, unique: true },
  status: { type: String, enum: ['success', 'failed'], default: 'success' },
  errorMessage: String
});

export default mongoose.model('MockBankTransaction', mockBankTransactionSchema);
