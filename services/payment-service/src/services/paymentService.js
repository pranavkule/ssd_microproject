const { randomUUID } = require('crypto');
const Payment = require('../models/Payment');

const OBJECT_ID_PATTERN = /^[0-9a-fA-F]{24}$/;
const PAYMENT_METHODS = ['UPI', 'card', 'netbanking'];

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

function createTransactionId() {
  const uniquePart = randomUUID().replace(/-/g, '').slice(0, 16).toUpperCase();
  return `TXN-${uniquePart}`;
}

async function listPayments(query) {
  const { page, limit, skip } = normalizePagination(query);

  const [payments, total] = await Promise.all([
    Payment.find().sort({ createdAt: -1 }).skip(skip).limit(limit),
    Payment.countDocuments(),
  ]);

  return {
    payments,
    pagination: {
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit),
    },
  };
}

async function getPaymentById(id) {
  if (!isValidObjectId(id)) {
    throw createHttpError(400, 'Invalid payment id');
  }

  const payment = await Payment.findById(id);

  if (!payment) {
    throw createHttpError(404, 'Payment not found');
  }

  return payment;
}

async function getPaymentByOrderId(orderId) {
  if (!isValidObjectId(orderId)) {
    throw createHttpError(400, 'Invalid order id');
  }

  const payment = await Payment.findOne({ orderId }).sort({ createdAt: -1 });

  if (!payment) {
    throw createHttpError(404, 'Payment not found for this order');
  }

  return payment;
}

async function createPayment(data = {}) {
  const orderId = typeof data.orderId === 'string' ? data.orderId : '';

  if (!isValidObjectId(orderId)) {
    throw createHttpError(400, 'A valid MongoDB orderId is required');
  }

  const amount = Number(data.amount);

  if (!Number.isFinite(amount) || amount <= 0) {
    throw createHttpError(400, 'Amount must be greater than zero');
  }

  const paymentMethod = typeof data.paymentMethod === 'string' ? data.paymentMethod : '';

  if (!PAYMENT_METHODS.includes(paymentMethod)) {
    throw createHttpError(
      400,
      `Invalid payment method. Allowed values: ${PAYMENT_METHODS.join(', ')}`
    );
  }

  const simulatedStatus = Math.random() < 0.9 ? 'successful' : 'failed';

  return Payment.create({
    orderId,
    amount: Math.round(amount * 100) / 100,
    paymentMethod,
    status: simulatedStatus,
    transactionId: createTransactionId(),
  });
}

module.exports = {
  listPayments,
  getPaymentById,
  getPaymentByOrderId,
  createPayment,
};
