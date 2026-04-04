import Inventory from '../../models/Inventory.js';
import { successResponse, errorResponse } from '../../utils/response.js';

export const getInventory = async (req, res) => {
  try {
    const { category, warehouse, low_stock_only, limit = 20, page = 1 } = req.query;
    const filter = {};
    if (category) filter.category = category;
    if (warehouse) filter.warehouse = warehouse;
    if (low_stock_only === 'true') {
      filter.$expr = { $lt: ['$quantity', '$lowStockThreshold'] };
    }

    const total = await Inventory.countDocuments(filter);
    const items = await Inventory.find(filter)
      .sort('-lastUpdated')
      .skip((parseInt(page) - 1) * parseInt(limit))
      .limit(parseInt(limit))
      .lean();

    const inventory = items.map(item => ({
      item_id: item.itemId,
      name: item.name,
      category: item.category,
      quantity: item.quantity,
      unit: item.unit,
      warehouse: item.warehouse,
      low_stock_threshold: item.lowStockThreshold,
      last_updated: item.lastUpdated.getTime()
    }));

    successResponse(res, { inventory }, 200, {
      page: parseInt(page),
      limit: parseInt(limit),
      total,
      pages: Math.ceil(total / parseInt(limit))
    });
  } catch (error) {
    console.error('Get inventory error:', error);
    errorResponse(res, 'INTERNAL_ERROR', 'Internal server error', 500);
  }
};

export const updateInventoryItem = async (req, res) => {
  try {
    const { item_id } = req.params;
    const { quantity } = req.body;
    if (quantity === undefined) return errorResponse(res, 'VALIDATION_ERROR', 'Quantity required', 400);

    const item = await Inventory.findOne({ itemId: item_id });
    if (!item) return errorResponse(res, 'RESOURCE_NOT_FOUND', 'Item not found', 404);

    item.quantity = quantity;
    item.lastUpdated = new Date();
    await item.save();

    successResponse(res, {
      item: {
        item_id: item.itemId,
        name: item.name,
        category: item.category,
        quantity: item.quantity,
        unit: item.unit,
        warehouse: item.warehouse,
        low_stock_threshold: item.lowStockThreshold,
        last_updated: item.lastUpdated.getTime()
      }
    });
  } catch (error) {
    console.error('Update inventory error:', error);
    errorResponse(res, 'INTERNAL_ERROR', 'Internal server error', 500);
  }
};