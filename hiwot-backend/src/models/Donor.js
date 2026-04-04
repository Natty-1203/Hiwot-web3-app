import mongoose from 'mongoose';

const donorSchema = new mongoose.Schema({
  wallet: { type: String, required: true, unique: true },
  name: String,
  email: String,
  organization: String,
  website: String,
  logo: String,
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now }
});

donorSchema.pre('save', function() {
  this.updatedAt = new Date();
});

export default mongoose.model('Donor', donorSchema);
