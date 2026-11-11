const mongoose = require('mongoose');

const schema = new mongoose.Schema({
  _id: { type: String, default: 'gateway' },
  proxyTimeoutMs: { type: Number, required: true, min: 100, max: 120000 },
  healthCheckIntervalMs: { type: Number, required: true, min: 250, max: 300000 },
  healthCheckTimeoutMs: { type: Number, required: true, min: 100, max: 60000 },
  healthCheckFailureThreshold: { type: Number, required: true, min: 1, max: 20 },
  healthCheckRecoveryThreshold: { type: Number, required: true, min: 1, max: 20 },
  rateLimitEnabled: { type: Boolean, default: true },
  rateLimitCapacity: { type: Number, default: 100, min: 1, max: 100000 },
  rateLimitRefillRate: { type: Number, default: 20, min: 1, max: 10000 },
}, { timestamps: true, versionKey: false });

module.exports = mongoose.model('GatewayConfiguration', schema);