function notFound(req, res) {
  res.status(404).json({
    success: false,
    message: `Management endpoint not found: ${req.method} ${req.originalUrl}`,
    timestamp: new Date().toISOString(),
  });
}

module.exports = notFound;
