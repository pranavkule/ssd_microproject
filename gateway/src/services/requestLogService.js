const mongoose = require('mongoose');
const GatewayRequestLog = require('../models/GatewayRequestLog');
const { createHttpError, SUPPORTED_HTTP_METHODS } = require('../utils/routeValidation');

const MAX_LIMIT = 100;
const MAX_PAGE = 1000000;

function parseInteger(value, name, fallback, maximum) {
  if (value === undefined) return fallback;
  if (typeof value !== 'string' || !/^\d+$/.test(value)) {
    throw createHttpError(400, `${name} must be a positive integer`);
  }
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < 1 || parsed > maximum) {
    throw createHttpError(400, `${name} must be between 1 and ${maximum}`);
  }
  return parsed;
}

function parseDate(value, name) {
  if (value === undefined) return undefined;
  if (typeof value !== 'string' || !value.trim() || !Number.isFinite(Date.parse(value))) {
    throw createHttpError(400, `${name} must be a valid ISO date`);
  }
  return new Date(value);
}

function buildLogQuery(query) {
  const allowed = new Set([
    'method', 'statusCode', 'route', 'success', 'from', 'to',
    'requestId', 'page', 'limit',
  ]);
  for (const [key, value] of Object.entries(query)) {
    if (!allowed.has(key)) throw createHttpError(400, `Unsupported log filter: ${key}`);
    if (Array.isArray(value)) throw createHttpError(400, `${key} must be provided once`);
  }
  const filter = {};
  if (query.method !== undefined) {
    if (typeof query.method !== 'string' ||
        !SUPPORTED_HTTP_METHODS.includes(query.method.toUpperCase())) {
      throw createHttpError(400, 'method is not supported');
    }
    filter.method = query.method.toUpperCase();
  }
  if (query.statusCode !== undefined) {
    if (typeof query.statusCode !== 'string' || !/^\d{3}$/.test(query.statusCode) ||
        Number(query.statusCode) < 100 || Number(query.statusCode) > 599) {
      throw createHttpError(400, 'statusCode must be from 100 to 599');
    }
    filter.statusCode = Number(query.statusCode);
  }
  if (query.route !== undefined) {
    if (typeof query.route !== 'string' || !query.route.trim() || query.route.length > 100) {
      throw createHttpError(400, 'route must be an ID or route name up to 100 characters');
    }
    const route = query.route.trim();
    filter.$or = mongoose.isValidObjectId(route)
      ? [{ routeId: route }, { routeName: route }]
      : [{ routeName: route }];
  }
  if (query.success !== undefined) {
    if (query.success !== 'true' && query.success !== 'false') {
      throw createHttpError(400, 'success must be true or false');
    }
    filter.success = query.success === 'true';
  }
  const from = parseDate(query.from, 'from');
  const to = parseDate(query.to, 'to');
  if (from && to && from > to) throw createHttpError(400, 'from must not be after to');
  if (from || to) {
    filter.timestamp = {};
    if (from) filter.timestamp.$gte = from;
    if (to) filter.timestamp.$lte = to;
  }
  if (query.requestId !== undefined) {
    if (typeof query.requestId !== 'string' || !query.requestId.trim() ||
        query.requestId.length > 100) {
      throw createHttpError(400, 'requestId must be non-empty and at most 100 characters');
    }
    filter.requestId = query.requestId.trim();
  }
  return {
    filter,
    page: parseInteger(query.page, 'page', 1, MAX_PAGE),
    limit: parseInteger(query.limit, 'limit', 50, MAX_LIMIT),
  };
}

async function listLogs(query) {
  if (mongoose.connection.readyState !== 1) {
    throw createHttpError(503, 'Request log database is unavailable');
  }
  const { filter, page, limit } = buildLogQuery(query);
  const [total, logs] = await Promise.all([
    GatewayRequestLog.countDocuments(filter),
    GatewayRequestLog.find(filter)
      .select('requestId method path query routeId routeName backendInstanceId timestamp statusCode durationMs success errorCategory')
      .sort({ timestamp: -1, _id: -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .lean(),
  ]);
  return {
    logs,
    pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
  };
}

module.exports = { MAX_LIMIT, MAX_PAGE, buildLogQuery, listLogs };