import mongoose from "mongoose";

const checkpointSchema = new mongoose.Schema({
  location: String,
  status: String,
  timestamp: { type: Date, default: Date.now },
  notes: String,
  recordedBy: String,
  txHash: String, // optional: if we record each checkpoint on-chain
});

const shipmentSchema = new mongoose.Schema({
  shipmentId: { type: String, required: true, unique: true },
  donor: String,
  program_id: { type: String }, // internalId of the goods program
  donor_wallet: { type: String }, // donor's wallet address (used for donor endpoints)
  recipient: String,
  items: [
    {
      name: String,
      quantity: Number,
      unit: String,
    },
  ],
  origin: String,
  destination: String,
  createdAt: { type: Date, default: Date.now },
  status: { type: String, default: "Created" },
  checkpoints: [checkpointSchema],
  anchorTxHash: String,
  lastUpdatedTxHash: String,
}, { timestamps: true });

export default mongoose.model("Shipment", shipmentSchema);
