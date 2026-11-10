const express = require('express');
const controller = require('../controllers/gatewayManagementController');

const router = express.Router();
router.get('/logs', controller.listLogs);
router.get('/metrics', controller.getMetrics);
router.get('/config', controller.getConfiguration);
router.put('/config', controller.updateConfiguration);

module.exports = router;