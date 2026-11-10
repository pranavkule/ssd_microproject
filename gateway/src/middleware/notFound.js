function notFound(req, res) {
  res.status(404).json({
    success: false,
    error: 'ROUTE_NOT_FOUND',
    message: `No active route matched ${req.method} ${req.originalUrl}`,
    timestamp: new Date().toISOString(),
  });
}

module.exports = notFound;
