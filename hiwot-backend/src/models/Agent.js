import mongoose from 'mongoose';

const agentSchema = new mongoose.Schema({
  agentId: { type: String, unique: true },
  name: { type: String, required: true },
  email: { type: String, required: true, unique: true },
  phone: String,
  isActive: { type: Boolean, default: true },
  programsAssigned: [{ type: String }], // internal program IDs
  lastActive: Date,
  totalDistributions: { type: Number, default: 0 },
  successRate: { type: Number, default: 0 }, // percentage
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now }
});

agentSchema.pre('save', function() {
  if (!this.agentId) {
    this.agentId = 'agent_' + Date.now() + '_' + Math.floor(Math.random() * 1000);
  }
  this.updatedAt = new Date();
});

export default mongoose.model('Agent', agentSchema);