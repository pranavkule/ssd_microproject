const mongoose = require('mongoose');

const schema = new mongoose.Schema({
  requestId: { type: String, required: true, unique: true },
  method: { type: String, required: true, uppercase: true, maxlength: 20 },
  path: { type: String, required: true, maxlength: 2048 },
  query: { type: [{ _id: false, key: String, value: String }], default: [] },
  routeId: { type: mongoose.Schema.Types.ObjectId, default: null },
  routeName: { type: String, default: null, maxlength: 100 },
  backendInstanceId: { type: String, default: null, maxlength: 100 },
  timestamp: { type: Date, required: true, default: Date.now },
  statusCode: { type: Number, required: true, min: 100, max: 599 },
  durationMs: { type: Number, required: true, min: 0 },
  success: { type: Boolean, required: true },
  errorCategory: { type: String, default: null, maxlength: 80 },
}, { versionKey: false });

schema.index({ timestamp: -1 });
schema.index({ statusCode: 1, timestamp: -1 });
schema.index({ routeId: 1, timestamp: -1 });
schema.index({ routeName: 1, timestamp: -1 });

module.exports = mongoose.model('GatewayRequestLog', schema);