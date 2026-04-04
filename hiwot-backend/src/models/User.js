import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';
import crypto from 'crypto';

const userSchema = new mongoose.Schema({
  email: { type: String, required: true, unique: true },
  passwordHash: { type: String, required: true },
  apiKey: { type: String, unique: true, default: () => crypto.randomBytes(32).toString('hex') },
  role: { type: String, enum: ['manager', 'donor', 'agent'], required: true },
  walletAddress: String,
  name: String,
  createdAt: { type: Date, default: Date.now }
});


userSchema.pre('save', async function(next) {
  if (!this.isModified('passwordHash')) return next();
  this.passwordHash = await bcrypt.hash(this.passwordHash, 10);
});

userSchema.methods.comparePassword = async function(candidate) {
  return await bcrypt.compare(candidate, this.passwordHash);
};

export default mongoose.model('User', userSchema);