function notFound(req, res) {
  res.locals.gatewayErrorCategory = 'unmatched_route';
  res.status(404).json({
    success: false,
    error: 'ROUTE_NOT_FOUND',
    message: `No active route matched ${req.method} ${req.originalUrl}`,
    timestamp: new Date().toISOString(),
  });
}

module.exports = notFound;
