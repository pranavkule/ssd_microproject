const express = require('express');
const routeController = require('../controllers/routeController');

const router = express.Router();

router.get('/', routeController.listRoutes);
router.post('/refresh', routeController.refreshRoutes);
router.post('/', routeController.createRoute);
router.get('/:id', routeController.getRouteById);
router.put('/:id', routeController.updateRoute);
router.patch('/:id/toggle', routeController.toggleRoute);
router.delete('/:id', routeController.deleteRoute);

module.exports = router;
