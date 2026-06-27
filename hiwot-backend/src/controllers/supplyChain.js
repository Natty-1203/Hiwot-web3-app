import Shipment from '../models/Shipment.js';
import { stellarService } from '../services/stellar.js';
import crypto from 'crypto';
import Donor from '../models/Donor.js';
import GoodsProgram from '../models/GoodsProgram.js';
import Claim from '../models/Claim.js';

// Helper to generate a mock shipment ID
function generateShipmentId() {
  return 'SHIP-' + Date.now() + '-' + Math.floor(Math.random() * 1000);
}

// Helper to compute hash of shipment data (for anchoring)
function computeShipmentHash(shipmentData) {
  const dataString = JSON.stringify(shipmentData);
  return crypto.createHash('sha256').update(dataString).digest('hex');
}

// Create a new shipment
export const createShipment = async (req, res) => {
  try {
    const { donor, recipient, items, origin, destination } = req.body;

    // Basic validation
    if (!donor || !recipient || !items || !origin || !destination) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    // Generate unique shipment ID
    const shipmentId = generateShipmentId();

    // Prepare shipment data (without checkpoints)
    const shipmentData = {
      shipmentId,
      donor,
      recipient,
      items,
      origin,
      destination,
      createdAt: new Date()
    };

    // Compute hash for anchoring
    const dataHash = computeShipmentHash(shipmentData);

    // Record hash on blockchain (mock)
    let anchorTxHash = null;
    try {
      anchorTxHash = await stellarService.recordShipmentHash(shipmentId, dataHash);
    } catch (error) {
      console.warn('Blockchain anchoring failed, continuing without tx hash:', error.message);
      // Still create shipment but without anchor
    }

    // Create shipment in database
    const shipment = new Shipment({
      ...shipmentData,
      anchorTxHash,
      checkpoints: [{
        location: origin,
        status: 'Created',
        notes: 'Shipment created',
        timestamp: new Date()
      }]
    });

    await shipment.save();

    res.status(201).json({
      success: true,
      shipmentId,
      anchorTxHash,
      shipment
    });
  } catch (error) {
    console.error('Error creating shipment:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

// Get all shipments (optionally filter by status, donor, etc.)
export const getAllShipments = async (req, res) => {
  try {
    const { status, donor } = req.query;
    const filter = {};
    if (status) filter.status = status;
    if (donor) filter.donor = donor;

    const shipments = await Shipment.find(filter).sort('-createdAt').lean();
    res.status(200).json({ shipments });
  } catch (error) {
    console.error('Error fetching shipments:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

// Get a single shipment by ID

export const getShipmentById = async (req, res) => {
  try {
    const { id } = req.params;
    const shipment = await Shipment.findOne({ shipmentId: id }).lean();
    if (!shipment) {
      return res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Shipment not found' } });
    }

    // Enrich with donor name
    const donor = await Donor.findOne({ wallet: shipment.donor_wallet }).lean();
    const donor_name = donor?.name || shipment.donor_wallet;

    // Program details
    let program_title = null;
    if (shipment.program_id) {
      const program = await GoodsProgram.findOne({ internalId: shipment.program_id }).lean();
      program_title = program?.title;
    }

    // Compute current location (latest checkpoint)
    const sortedCheckpoints = [...shipment.checkpoints].sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
    const current_location = sortedCheckpoints[0] || null;

    // Compute progress: total items distributed vs total items in shipment
    let totalItems = shipment.items.reduce((sum, i) => sum + i.quantity, 0);
    // Get distributed items from claims that link to this shipment via batch
    const claims = await Claim.find({ claimType: 'goods', batchNumber: { $in: shipment.items.map(i => i.batchNumber) } }).lean();
    const totalDistributed = claims.reduce((sum, c) => sum + c.quantity, 0);
    const progress = totalItems ? Math.round((totalDistributed / totalItems) * 100) : 0;

    // Build origin/destination objects
    const origin = {
      name: shipment.origin,
      coordinates: null, // TODO
      timestamp: shipment.createdAt?.toISOString()
    };
    const destination = {
      name: shipment.destination,
      coordinates: null,
      timestamp: shipment.updatedAt?.toISOString()
    };

    // Enhance items with remaining and distributed
    const enhancedItems = shipment.items.map(item => {
      const itemClaims = claims.filter(c => c.itemId === item.itemId && c.batchNumber === item.batchNumber);
      const distributed = itemClaims.reduce((sum, c) => sum + c.quantity, 0);
      const remaining = item.quantity - distributed;
      return { ...item, remaining, distributed };
    });

    res.json({
      success: true,
      shipment: {
        shipmentId: shipment.shipmentId,
        donor: shipment.donor_wallet,
        donor_name,
        recipient: shipment.recipient,
        program_id: shipment.program_id,
        program_title,
        items: enhancedItems,
        origin,
        destination,
        current_location: current_location ? { name: current_location.location, coordinates: null, status: current_location.status } : null,
        status: shipment.status,
        progress,
        checkpoints: shipment.checkpoints.sort((a,b) => new Date(a.timestamp) - new Date(b.timestamp)),
        created_at: shipment.createdAt?.toISOString(),
        updated_at: shipment.updatedAt?.toISOString()
      }
    });
  } catch (error) {
    console.error('Get shipment error:', error);
    res.status(500).json({ success: false, error: { code: 'INTERNAL_ERROR', message: 'Internal server error' } });
  }
};

// Add a checkpoint to a shipment
export const addCheckpoint = async (req, res) => {
  try {
    const { id } = req.params;
    const { location, status, notes, recordedBy } = req.body;

    if (!location || !status) {
      return res.status(400).json({ error: 'location and status are required' });
    }

    const shipment = await Shipment.findOne({ shipmentId: id });
    if (!shipment) {
      return res.status(404).json({ error: 'Shipment not found' });
    }

    // Create checkpoint
    const checkpoint = {
      location,
      status,
      notes,
      recordedBy,
      timestamp: new Date()
    };

    // Optionally anchor checkpoint on blockchain
    try {
      const checkpointData = {
        shipmentId: id,
        checkpoint,
        previousTxHash: shipment.lastUpdatedTxHash
      };
      const checkpointHash = computeShipmentHash(checkpointData);
      const txHash = await stellarService.recordShipmentHash(id + '-checkpoint', checkpointHash);
      checkpoint.txHash = txHash;
      shipment.lastUpdatedTxHash = txHash;
    } catch (error) {
      console.warn('Checkpoint anchoring failed:', error.message);
    }

    // Add checkpoint
    shipment.checkpoints.push(checkpoint);
    shipment.status = status; // update overall status

    await shipment.save();

    res.status(200).json({
      success: true,
      checkpoint,
      txHash: checkpoint.txHash
    });
  } catch (error) {
    console.error('Error adding checkpoint:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

// Get tracking timeline (same as shipment details with checkpoints sorted)
export const getTracking = async (req, res) => {
  try {
    const { id } = req.params;
    const shipment = await Shipment.findOne({ shipmentId: id })
      .select('shipmentId status checkpoints origin destination items donor recipient createdAt')
      .lean();
    if (!shipment) {
      return res.status(404).json({ error: 'Shipment not found' });
    }
    // Sort checkpoints by timestamp (ascending)
    shipment.checkpoints.sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));
    res.status(200).json(shipment);
  } catch (error) {
    console.error('Error fetching tracking:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};
