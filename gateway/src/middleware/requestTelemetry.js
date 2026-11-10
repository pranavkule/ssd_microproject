const { randomUUID } = require('node:crypto');
const mongoose = require('mongoose');
const GatewayRequestLog = require('../models/GatewayRequestLog');
const requestMetrics = require('../services/requestMetrics');
const { getSafeRequestData } = require('../utils/requestLogSanitizer');

function isPublicTraffic(pathname) {
  return pathname !== '/health' &&
    pathname !== '/api/gateway' &&
    !pathname.startsWith('/api/gateway/');
}

function persist(record) {
  if (mongoose.connection.readyState !== 1) return Promise.resolve(false);
  return GatewayRequestLog.create(record).then(() => true).catch((error) => {
    console.warn(`[GATEWAY] Request log persistence failed: ${error.message}`);
    return false;
  });
}

function requestTelemetry(req, res, next) {
  const requestId = randomUUID();
  req.gatewayRequestId = requestId;
  res.setHeader('X-Request-Id', requestId);
  const { path, query } = getSafeRequestData(req.originalUrl || req.url);
  const tracked = isPublicTraffic(path);
  const startedAt = process.hrtime.bigint();
  if (tracked) requestMetrics.beginRequest();

  let completed = false;
  const complete = (statusCode) => {
    if (!tracked || completed) return;
    completed = true;
    const durationMs = Number(process.hrtime.bigint() - startedAt) / 1e6;
    const route = req.gatewayRoute || req.gatewayMatchedRoute || null;
    const routeId = route?._id || route?.id || null;
    const success = statusCode < 400;
    requestMetrics.completeRequest({
      statusCode,
      durationMs,
      routeId: routeId ? String(routeId) : null,
      routeName: route?.name || null,
    });
    persist({
      requestId,
      method: req.method,
      path,
      query,
      routeId: routeId && mongoose.isValidObjectId(routeId) ? routeId : null,
      routeName: route?.name || null,
      backendInstanceId: req.gatewayBackend?.id || null,
      timestamp: new Date(),
      statusCode,
      durationMs: Number(durationMs.toFixed(2)),
      success,
      errorCategory: success
        ? null
        : statusCode === 499
          ? 'client_disconnected'
          : res.locals.gatewayErrorCategory ||
          (statusCode >= 500 ? 'upstream_or_gateway_error' : 'request_error'),
    });
  };
  res.once('finish', () => complete(res.statusCode));
  res.once('close', () => {
    if (!res.writableFinished) complete(499);
  });
  next();
}

module.exports = {
  isPublicTraffic,
  persistRequestLog: persist,
  requestTelemetry,
};