const routeService = require('../services/routeService');

async function listRoutes(req, res, next) {
  try {
    const result = await routeService.listRoutes();

    res.status(200).json({
      success: true,
      message: 'Routes retrieved successfully',
      data: result.routes,
      count: result.routes.length,
      registry: result.registry,
    });
  } catch (error) {
    next(error);
  }
}

async function getRouteById(req, res, next) {
  try {
    const route = await routeService.getRouteById(req.params.id);

    res.status(200).json({
      success: true,
      message: 'Route retrieved successfully',
      data: route,
    });
  } catch (error) {
    next(error);
  }
}

async function createRoute(req, res, next) {
  try {
    const route = await routeService.createRoute(req.body);

    res.status(201).json({
      success: true,
      message: 'Route created successfully',
      data: route,
    });
  } catch (error) {
    next(error);
  }
}

async function updateRoute(req, res, next) {
  try {
    const route = await routeService.updateRoute(req.params.id, req.body);

    res.status(200).json({
      success: true,
      message: 'Route updated successfully',
      data: route,
    });
  } catch (error) {
    next(error);
  }
}

async function toggleRoute(req, res, next) {
  try {
    const result = await routeService.toggleRoute(req.params.id, req.body);
    const state = result.route.enabled ? 'enabled' : 'disabled';

    res.status(200).json({
      success: true,
      message: result.changed
        ? `Route ${state} successfully`
        : `Route is already ${state}`,
      data: result.route,
    });
  } catch (error) {
    next(error);
  }
}

async function deleteRoute(req, res, next) {
  try {
    const route = await routeService.deleteRoute(req.params.id);

    res.status(200).json({
      success: true,
      message: 'Route deleted successfully',
      data: route,
    });
  } catch (error) {
    next(error);
  }
}

async function refreshRoutes(req, res, next) {
  try {
    const summary = await routeService.refreshRegistry();

    res.status(200).json({
      success: true,
      message: 'Route registry refreshed successfully',
      data: summary,
    });
  } catch (error) {
    next(error);
  }
}

module.exports = {
  listRoutes,
  getRouteById,
  createRoute,
  updateRoute,
  toggleRoute,
  deleteRoute,
  refreshRoutes,
};
