const mongoose = require('mongoose');
const env = require('../config/env');
const GatewayConfiguration = require('../models/GatewayConfiguration');
const backendHealthMonitor = require('./backendHealthMonitor');
const proxyService = require('./proxyService');
const { rateLimiter, DEFAULT_CAPACITY, DEFAULT_REFILL_RATE } = require('./rateLimiter');
const { createHttpError } = require('../utils/routeValidation');

const RANGES = Object.freeze({
  proxyTimeoutMs: [100, 120000],
  healthCheckIntervalMs: [250, 300000],
  healthCheckTimeoutMs: [100, 60000],
  healthCheckFailureThreshold: [1, 20],
  healthCheckRecoveryThreshold: [1, 20],
  rateLimitCapacity: [1, 100000],
  rateLimitRefillRate: [1, 10000],
});
const numericFields = Object.keys(RANGES);
const fields = [...numericFields, 'rateLimitEnabled'];
const defaults = Object.freeze({
  proxyTimeoutMs: env.proxyTimeoutMs,
  healthCheckIntervalMs: env.healthCheckIntervalMs,
  healthCheckTimeoutMs: env.healthCheckTimeoutMs,
  healthCheckFailureThreshold: env.healthCheckFailureThreshold,
  healthCheckRecoveryThreshold: env.healthCheckRecoveryThreshold,
  rateLimitEnabled: true,
  rateLimitCapacity: DEFAULT_CAPACITY,
  rateLimitRefillRate: DEFAULT_REFILL_RATE,
});
let settings = { ...defaults };
let loadedFromDatabase = false;

function validateConfiguration(payload) {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    throw createHttpError(400, 'Configuration must be a JSON object');
  }
  const keys = Object.keys(payload);
  if (!keys.length) throw createHttpError(400, 'At least one setting is required');
  for (const key of keys) {
    if (key === 'rateLimitEnabled') {
      if (typeof payload[key] !== 'boolean') {
        throw createHttpError(400, 'rateLimitEnabled must be a boolean');
      }
      continue;
    }
    const range = RANGES[key];
    if (!range) throw createHttpError(400, `Unsupported configuration setting: ${key}`);
    const value = payload[key];
    if (!Number.isInteger(value) || value < range[0] || value > range[1]) {
      throw createHttpError(400, `${key} must be an integer between ${range[0]} and ${range[1]}`);
    }
  }
  return { ...payload };
}

function applyRuntime(next) {
  const normalized = { ...defaults, ...next };
  proxyService.setProxyTimeout(normalized.proxyTimeoutMs);
  backendHealthMonitor.updateConfiguration({
    intervalMs: normalized.healthCheckIntervalMs,
    timeoutMs: normalized.healthCheckTimeoutMs,
    failureThreshold: normalized.healthCheckFailureThreshold,
    recoveryThreshold: normalized.healthCheckRecoveryThreshold,
  });
  rateLimiter.configure({
    enabled: normalized.rateLimitEnabled,
    capacity: normalized.rateLimitCapacity,
    refillRate: normalized.rateLimitRefillRate,
  });
  settings = normalized;
}

function configurationSnapshot() {
  const persistenceAvailable = mongoose.connection.readyState === 1;
  return {
    settings: { ...settings },
    rateLimiting: rateLimiter.getSnapshot(),
    source: loadedFromDatabase
      ? persistenceAvailable ? 'database' : 'database_cache'
      : 'environment_defaults',
    persistenceAvailable,
  };
}

async function getConfiguration() {
  if (mongoose.connection.readyState === 1 && !loadedFromDatabase) {
    await initialize();
  }
  return configurationSnapshot();
}

async function initialize() {
  if (mongoose.connection.readyState !== 1) {
    applyRuntime(defaults);
    loadedFromDatabase = false;
    return configurationSnapshot();
  }
  try {
    let document = await GatewayConfiguration.findById('gateway').lean();
    if (!document) document = (await GatewayConfiguration.create(defaults)).toObject();
    applyRuntime({ ...defaults, ...document });
    loadedFromDatabase = true;
  } catch (error) {
    applyRuntime(defaults);
    loadedFromDatabase = false;
    console.error(`[CONFIG] Unable to load gateway configuration: ${error.message}`);
  }
  return configurationSnapshot();
}

async function updateConfiguration(payload) {
  const updates = validateConfiguration(payload);
  if (mongoose.connection.readyState !== 1) {
    throw createHttpError(503, 'Gateway configuration database is unavailable');
  }
  if (!loadedFromDatabase) await initialize();
  const previous = { ...settings };
  const next = { ...defaults, ...previous, ...updates };
  const document = await GatewayConfiguration.findOneAndUpdate(
    { _id: 'gateway' },
    { $set: next },
    { new: true, upsert: true, runValidators: true, setDefaultsOnInsert: true }
  ).lean();
  try {
    applyRuntime(document);
    loadedFromDatabase = true;
  } catch (error) {
    try {
      await GatewayConfiguration.findOneAndUpdate(
        { _id: 'gateway' },
        { $set: previous },
        { upsert: true, runValidators: true }
      );
      applyRuntime(previous);
    } catch (rollbackError) {
      console.error(`[CONFIG] Runtime rollback failed: ${rollbackError.message}`);
    }
    throw error;
  }
  return configurationSnapshot();
}

module.exports = {
  RANGES,
  fields,
  defaults,
  getConfiguration,
  initialize,
  updateConfiguration,
  validateConfiguration,
};