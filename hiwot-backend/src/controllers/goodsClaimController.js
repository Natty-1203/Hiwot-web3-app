import Claim from '../models/Claim.js';
import Beneficiary from '../models/Beneficiary.js';
import GoodsProgram from '../models/GoodsProgram.js';

export const claimGoods = async (req, res) => {
  try {
    const { nullifier_hash, program_id, itemId, quantity, location, batchNumber } = req.body;
    if (!nullifier_hash || !program_id || !itemId || !quantity || !location) {
      return res.status(400).json({ success: false, error: { code: 'MISSING_FIELDS', message: 'All fields required' } });
    }

    const beneficiary = await Beneficiary.findOne({ nullifier: nullifier_hash });
    if (!beneficiary) {
      return res.status(403).json({ success: false, error: { code: 'BENEFICIARY_NOT_FOUND', message: 'Beneficiary not registered' } });
    }

    const program = await GoodsProgram.findOne({ internalId: program_id });
    if (!program) {
      return res.status(404).json({ success: false, error: { code: 'PROGRAM_NOT_FOUND', message: 'Program not found' } });
    }

    const existing = await Claim.findOne({ nullifier: nullifier_hash, programInternalId: program_id, claimType: 'goods', itemId, batchNumber });
    if (existing) {
      return res.status(409).json({ success: false, error: { code: 'ALREADY_CLAIMED', message: 'Already claimed this item/batch' } });
    }

    const inventoryIndex = program.inventory.findIndex(i => i.itemId === itemId && i.batchNumber === batchNumber);
    if (inventoryIndex === -1) {
      return res.status(404).json({ success: false, error: { code: 'ITEM_NOT_FOUND', message: 'Item batch not found' } });
    }
    const inventoryItem = program.inventory[inventoryIndex];
    if (inventoryItem.quantityAvailable < quantity) {
      return res.status(400).json({ success: false, error: { code: 'INSUFFICIENT_STOCK', message: `Only ${inventoryItem.quantityAvailable} available` } });
    }

    program.inventory[inventoryIndex].quantityAvailable -= quantity;
    await program.save();

    const claim = new Claim({
      nullifier: nullifier_hash,
      programId: program.programId,
      programInternalId: program.internalId,
      claimType: 'goods',
      itemId,
      quantity,
      unit: inventoryItem.unit,
      batchNumber: inventoryItem.batchNumber,
      expiryDate: inventoryItem.expiryDate,
      timestamp: new Date(),
      status: 'completed',
      synced: true,
      location
    });
    await claim.save();

    res.status(200).json({
      success: true,
      claim: {
        claim_id: claim._id,
        nullifier_hash: claim.nullifier,
        program_id: claim.programInternalId,
        item: {
          itemId: claim.itemId,
          name: inventoryItem.name,
          quantity: claim.quantity,
          unit: claim.unit,
          batchNumber: claim.batchNumber,
          expiryDate: claim.expiryDate ? claim.expiryDate?.toISOString() : null
        },
        claimed_at: claim.timestamp?.toISOString()
      }
    });
  } catch (error) {
    console.error('Goods claim error:', error);
    res.status(500).json({ success: false, error: { code: 'INTERNAL_ERROR', message: error.message } });
  }
};

export const listGoodsClaims = async (req, res) => {
  try {
    const { program_id, page = 1, limit = 20 } = req.query;
    const filter = { claimType: 'goods' };
    if (program_id) filter.programInternalId = program_id;

    const claims = await Claim.find(filter).sort('-timestamp').limit(parseInt(limit)).skip((parseInt(page) - 1) * parseInt(limit)).lean();
    const programIds = [...new Set(claims.map(c => c.programInternalId))];
    const programs = await GoodsProgram.find({ internalId: { $in: programIds } }).lean();
    const programMap = Object.fromEntries(programs.map(p => [p.internalId, p.title]));

    res.json({
      success: true,
      claims: claims.map(c => ({
        claim_id: c._id,
        nullifier_hash: c.nullifier,
        program_id: c.programInternalId,
        program_title: programMap[c.programInternalId] || '',
        item: {
          itemId: c.itemId,
          quantity: c.quantity,
          unit: c.unit,
          batchNumber: c.batchNumber,
          expiryDate: c.expiryDate ? c.expiryDate?.toISOString() : null
        },
        timestamp: c.timestamp?.toISOString()
      })),
      page: parseInt(page),
      limit: parseInt(limit),
      total: await Claim.countDocuments(filter)
    });
  } catch (error) {
    console.error('List goods claims error:', error);
    res.status(500).json({ success: false, error: { code: 'INTERNAL_ERROR', message: 'Internal server error' } });
  }
};
