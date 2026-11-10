const express = require('express');
const paymentController = require('../controllers/paymentController');

const router = express.Router();

router.get('/', paymentController.getPayments);
router.get('/order/:orderId', paymentController.getPaymentByOrderId);
router.get('/:id', paymentController.getPaymentById);
router.post('/', paymentController.createPayment);

module.exports = router;
