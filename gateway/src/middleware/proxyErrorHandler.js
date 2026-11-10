const TIMEOUT_ERROR_CODES = new Set([
  'ETIMEDOUT',
  'ESOCKETTIMEDOUT',
  'ECONNABORTED',
  'ERR_SOCKET_CONNECTION_TIMEOUT',
]);

function proxyErrorHandler(error, req, res, route, proxyTimeoutMs) {
  const startedAt = res.locals.proxyStartedAt || Date.now();
  const duration = Date.now() - startedAt;
  const routeName = route && route.name ? route.name : 'Unknown route';
  const timedOutReset =
    error.code === 'ECONNRESET' &&
    Number.isFinite(proxyTimeoutMs) &&
    duration >= proxyTimeoutMs - 100;
  const isTimeout = TIMEOUT_ERROR_CODES.has(error.code) || timedOutReset;
  const statusCode = isTimeout ? 504 : 502;
  const errorCode = isTimeout ? 'GATEWAY_TIMEOUT' : 'SERVICE_UNAVAILABLE';
  const message = isTimeout
    ? `${routeName} timed out while processing the request`
    : `${routeName} is currently unavailable`;

  console.error(
    `[GATEWAY] ${new Date().toISOString()} Proxy failure: ${req.method} ${req.originalUrl} -> ${routeName} | ${statusCode} | ${duration}ms | ${error.code || 'PROXY_ERROR'}`
  );

  if (res.headersSent || res.writableEnded) {
    if (!res.writableEnded) {
      res.end();
    }
    return;
  }

  if (res.locals.proxyErrorSent) {
    return;
  }

  res.locals.proxyErrorSent = true;
  res.status(statusCode).json({
    success: false,
    error: errorCode,
    message,
    route: routeName,
    service: routeName,
    timestamp: new Date().toISOString(),
  });
}

module.exports = proxyErrorHandler;
