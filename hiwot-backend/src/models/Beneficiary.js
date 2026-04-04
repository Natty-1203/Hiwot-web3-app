import mongoose from 'mongoose';

const beneficiarySchema = new mongoose.Schema({
  internalId: { type: String, unique: true },
  nullifier: { type: String, required: true, unique: true },
  walletAddress: { type: String }, //  required: true for on-chain
  deviceId: String,
  registeredAt: { type: Date, default: Date.now },
  registeredLocation: {
    lat: Number,
    lng: Number
  },
  demographics: {
    age: Number,
    gender: { type: String, enum: ['male', 'female'] },
    householdSize: Number,
    vulnerabilities: [String] // e.g., ['pregnant', 'disabled', 'elderly']
  },
  synced: { type: Boolean, default: false },
  txHash: String,

  // fields for field agent
  name: String,
  phone: String,
  locationText: String, // e.g., "Amhara Region, Bahir Dar"
  familySize: Number,
  vulnerabilityScore: Number,
  isActive: { type: Boolean, default: true },
  registeredBy: String, // agent wallet address
});

beneficiarySchema.pre('save', function() {
  if (!this.internalId) {
    this.internalId = 'b_' + Date.now() + '_' + Math.floor(Math.random() * 1000);
  }
});

export default mongoose.model('Beneficiary', beneficiarySchema);
