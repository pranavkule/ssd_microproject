const Order = require('../models/Order');

const OBJECT_ID_PATTERN = /^[0-9a-fA-F]{24}$/;

const ORDER_STATUSES = ['pending', 'confirmed', 'shipped', 'delivered', 'cancelled'];

const ALLOWED_STATUS_TRANSITIONS = {
  pending: ['confirmed', 'cancelled'],
  confirmed: ['shipped', 'cancelled'],
  shipped: ['delivered'],
  delivered: [],
  cancelled: [],
};

function createHttpError(statusCode, message) {
  const error = new Error(message);
  error.statusCode = statusCode;
  return error;
}

function isValidObjectId(value) {
  return typeof value === 'string' && OBJECT_ID_PATTERN.test(value);
}

function normalizePagination(query = {}) {
  const page = query.page === undefined ? 1 : Number(query.page);
  const limit = query.limit === undefined ? 10 : Number(query.limit);

  if (!Number.isInteger(page) || page < 1) {
    throw createHttpError(400, 'Page must be a positive integer');
  }

  if (!Number.isInteger(limit) || limit < 1 || limit > 100) {
    throw createHttpError(400, 'Limit must be an integer between 1 and 100');
  }

  return {
    page,
    limit,
    skip: (page - 1) * limit,
  };
}

function normalizeItems(items) {
  if (!Array.isArray(items) || items.length === 0) {
    throw createHttpError(400, 'Order must contain at least one item');
  }

  return items.map((item, index) => {
    if (!item || typeof item !== 'object') {
      throw createHttpError(400, `Item at index ${index} must be an object`);
    }

    const productId = typeof item.productId === 'string' ? item.productId : '';

    if (!isValidObjectId(productId)) {
      throw createHttpError(
        400,
        `Item at index ${index} must include a valid MongoDB productId`
      );
    }

    const quantity = Number(item.quantity);

    if (!Number.isInteger(quantity) || quantity < 1) {
      throw createHttpError(
        400,
        `Item at index ${index} must have a positive integer quantity`
      );
    }

    const price = Number(item.price);

    if (!Number.isFinite(price) || price < 0) {
      throw createHttpError(
        400,
        `Item at index ${index} must have a price greater than or equal to zero`
      );
    }

    return {
      productId,
      quantity,
      price,
    };
  });
}

function calculateTotalAmount(items) {
  const total = items.reduce((sum, item) => sum + item.quantity * item.price, 0);
  return Math.round(total * 100) / 100;
}

async function listOrders(query) {
  const { page, limit, skip } = normalizePagination(query);

  const [orders, total] = await Promise.all([
    Order.find().sort({ createdAt: -1 }).skip(skip).limit(limit),
    Order.countDocuments(),
  ]);

  return {
    orders,
    pagination: {
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit),
    },
  };
}

async function getOrderById(id) {
  if (!isValidObjectId(id)) {
    throw createHttpError(400, 'Invalid order id');
  }

  const order = await Order.findById(id);

  if (!order) {
    throw createHttpError(404, 'Order not found');
  }

  return order;
}

async function createOrder(data = {}) {
  const userId = typeof data.userId === 'string' ? data.userId : '';

  if (!isValidObjectId(userId)) {
    throw createHttpError(400, 'A valid MongoDB userId is required');
  }

  const items = normalizeItems(data.items);

  return Order.create({
    userId,
    items,
    totalAmount: calculateTotalAmount(items),
    status: 'pending',
  });
}

async function updateOrderStatus(id, status) {
  if (!isValidObjectId(id)) {
    throw createHttpError(400, 'Invalid order id');
  }

  if (!status || typeof status !== 'string' || !ORDER_STATUSES.includes(status)) {
    throw createHttpError(
      400,
      `Invalid order status. Allowed statuses: ${ORDER_STATUSES.join(', ')}`
    );
  }

  const order = await Order.findById(id);

  if (!order) {
    throw createHttpError(404, 'Order not found');
  }

  const allowedNextStatuses = ALLOWED_STATUS_TRANSITIONS[order.status];

  if (!allowedNextStatuses.includes(status)) {
    throw createHttpError(
      400,
      `Invalid status transition from "${order.status}" to "${status}"`
    );
  }

  order.status = status;
  await order.save();
  return order;
}

async function deleteOrder(id) {
  if (!isValidObjectId(id)) {
    throw createHttpError(400, 'Invalid order id');
  }

  const order = await Order.findByIdAndDelete(id);

  if (!order) {
    throw createHttpError(404, 'Order not found');
  }

  return order;
}

module.exports = {
  listOrders,
  getOrderById,
  createOrder,
  updateOrderStatus,
  deleteOrder,
};
