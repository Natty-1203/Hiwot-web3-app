import GoodsProgram from '../models/GoodsProgram.js';
import { generateGeofencePolygon } from '../utils/geofence.js';
import Claim from '../models/Claim.js';

export const createGoodsProgram = async (req, res) => {
  try {
    const { organization_wallet, title, inventory, location, deadline } = req.body;
    if (!organization_wallet || !title || !inventory || !location || !deadline) {
      return res.status(400).json({ success: false, error: { code: 'MISSING_FIELDS', message: 'All fields required' } });
    }

    const geofencePolygon = generateGeofencePolygon(location.lat, location.lng);
    const preparedInventory = inventory.map(item => ({
      ...item,
      expiryDate: item.expiryDate ? new Date(item.expiryDate) : null
    }));

    const program = new GoodsProgram({
      organizationWallet: organization_wallet,
      title,
      inventory: preparedInventory,
      location,
      geofence: geofencePolygon,
      deadline: new Date(deadline),
      active: true,
      synced: false
    });
    await program.save();

    res.status(201).json({
      success: true,
      program: {
        program_id: program.internalId,
        title: program.title,
        inventory: program.inventory,
        location: program.location,
        deadline: program.deadline?.toISOString()?.split('T')[0],
        created_at: program.createdAt?.toISOString()
      }
    });
  } catch (error) {
    console.error('Create goods program error:', error);
    res.status(500).json({ success: false, error: { code: 'INTERNAL_ERROR', message: 'Internal server error' } });
  }
};

export const getGoodsPrograms = async (req, res) => {
  try {
    const { active, limit = 10, page = 1 } = req.query;
    const filter = {};
    if (active === 'true') filter.active = true;

    const programs = await GoodsProgram.find(filter)
      .sort('-createdAt')
      .limit(parseInt(limit))
      .skip((parseInt(page) - 1) * parseInt(limit))
      .lean();

    res.json({
      success: true,
      programs: programs.map(p => ({
        program_id: p.internalId,
        title: p.title,
        deadline: p.deadline?.toISOString()?.split('T')[0]
      }))
    });
  } catch (error) {
    console.error('Get goods programs error:', error);
    res.status(500).json({ success: false, error: { code: 'INTERNAL_ERROR', message: 'Internal server error' } });
  }
};

export const getGoodsProgramDetails = async (req, res) => {
  try {
    const { program_id } = req.params;
    const program = await GoodsProgram.findOne({ internalId: program_id }).lean();
    if (!program) {
      return res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Program not found' } });
    }

    // Get goods claims
    const claims = await Claim.find({ programInternalId: program_id, claimType: 'goods' }).lean();
    const totalBeneficiaries = new Set(claims.map(c => c.nullifier)).size;
    const totalItemsDistributed = claims.reduce((sum, c) => sum + c.quantity, 0);
    const completionRate = program.totalClaims ? (totalItemsDistributed / (program.totalClaims * program.inventory.reduce((acc, i) => acc + i.quantityAvailable, 0))) * 100 : 0; // Not perfect; better to compute from inventory totals.

    // Enhance inventory with distributed count
    const inventoryWithDistributed = program.inventory.map(item => {
      const itemClaims = claims.filter(c => c.itemId === item.itemId && c.batchNumber === item.batchNumber);
      const distributed = itemClaims.reduce((sum, c) => sum + c.quantity, 0);
      return {
        itemId: item.itemId,
        name: item.name,
        quantityAvailable: item.quantityAvailable,
        totalQuantity: item.totalQuantity,
        unit: item.unit,
        batchNumber: item.batchNumber,
        expiryDate: item.expiryDate ? item.expiryDate?.toISOString()?.split('T')[0] : null,
        distributed
      };
    });

    res.json({
      success: true,
      program: {
        program_id: program.internalId,
        title: program.title,
        organization_wallet: program.organizationWallet,
        location: program.location,
        deadline: program.deadline?.toISOString()?.split('T')[0],
        status: program.active ? 'active' : 'closed',
        created_at: program.createdAt?.toISOString(),
        statistics: {
          total_beneficiaries: totalBeneficiaries,
          total_items_distributed: totalItemsDistributed,
          completion_rate: Math.round(completionRate)
        },
        inventory: inventoryWithDistributed
      }
    });
  } catch (error) {
    console.error('Get goods program details error:', error);
    res.status(500).json({ success: false, error: { code: 'INTERNAL_ERROR', message: 'Internal server error' } });
  }
};

export const getProgramInventory = async (req, res) => {
  try {
    const { id } = req.params;
    const program = await GoodsProgram.findOne({ internalId: id }).lean();
    if (!program) {
      return res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Program not found' } });
    }
    res.json({
      success: true,
      program_id: program.internalId,
      inventory: program.inventory.map(i => ({
        itemId: i.itemId,
        name: i.name,
        quantityAvailable: i.quantityAvailable,
        totalQuantity: i.totalQuantity,
        unit: i.unit,
        batchNumber: i.batchNumber,
        expiryDate: i.expiryDate ? i.expiryDate?.toISOString() : null
      }))
    });
  } catch (error) {
    console.error('Get inventory error:', error);
    res.status(500).json({ success: false, error: { code: 'INTERNAL_ERROR', message: 'Internal server error' } });
  }
};
