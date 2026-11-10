const paymentService = require('../services/paymentService');

async function getPayments(req, res, next) {
  try {
    const result = await paymentService.listPayments(req.query);

    res.status(200).json({
      success: true,
      message: 'Payments retrieved successfully',
      data: result.payments,
      pagination: result.pagination,
    });
  } catch (error) {
    next(error);
  }
}

async function getPaymentById(req, res, next) {
  try {
    const payment = await paymentService.getPaymentById(req.params.id);

    res.status(200).json({
      success: true,
      message: 'Payment retrieved successfully',
      data: payment,
    });
  } catch (error) {
    next(error);
  }
}

async function getPaymentByOrderId(req, res, next) {
  try {
    const payment = await paymentService.getPaymentByOrderId(req.params.orderId);

    res.status(200).json({
      success: true,
      message: 'Payment retrieved successfully',
      data: payment,
    });
  } catch (error) {
    next(error);
  }
}

async function createPayment(req, res, next) {
  try {
    const payment = await paymentService.createPayment(req.body);

    res.status(201).json({
      success: true,
      message: `Payment simulation completed with status "${payment.status}"`,
      data: payment,
    });
  } catch (error) {
    next(error);
  }
}

module.exports = {
  getPayments,
  getPaymentById,
  getPaymentByOrderId,
  createPayment,
};
