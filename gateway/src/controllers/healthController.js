const env = require('../config/env');
const { getDatabaseStatus } = require('../config/db');
const { getServiceSummaries } = require('../config/services');

function getHealth(req, res) {
  res.status(200).json({
    application: 'Dynamic L7 API Gateway',
    status: 'running',
    environment: env.nodeEnv,
    timestamp: new Date().toISOString(),
    uptimeSeconds: Math.floor(process.uptime()),
    database: getDatabaseStatus(),
    services: getServiceSummaries(),
  });
}

module.exports = {
  getHealth,
};
