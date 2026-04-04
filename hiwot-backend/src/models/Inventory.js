import mongoose from 'mongoose';

const inventorySchema = new mongoose.Schema({
  itemId: { type: String, unique: true },
  name: { type: String, required: true },
  category: { type: String, enum: ['food', 'water', 'medicine', 'shelter', 'cash'], required: true },
  quantity: { type: Number, required: true },
  unit: String,
  warehouse: String,
  lowStockThreshold: { type: Number, default: 0 },
  lastUpdated: { type: Date, default: Date.now }
});

inventorySchema.pre('save', function() {
  if (!this.itemId) {
    this.itemId = 'inv_' + Date.now() + '_' + Math.floor(Math.random() * 1000);
  }
  this.lastUpdated = new Date();

});

export default mongoose.model('Inventory', inventorySchema);