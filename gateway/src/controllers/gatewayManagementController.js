const requestLogService = require('../services/requestLogService');
const requestMetrics = require('../services/requestMetrics');
const gatewayConfiguration = require('../services/gatewayConfiguration');

async function listLogs(req, res, next) {
  try {
    const result = await requestLogService.listLogs(req.query);
    res.status(200).json({
      success: true,
      message: 'Gateway request logs retrieved successfully',
      data: result.logs,
      pagination: result.pagination,
    });
  } catch (error) {
    next(error);
  }
}

function getMetrics(req, res) {
  res.status(200).json({
    success: true,
    message: 'Current-process gateway metrics retrieved successfully',
    data: requestMetrics.getSnapshot(),
  });
}

async function getConfiguration(req, res, next) {
  try {
    res.status(200).json({
      success: true,
      message: 'Gateway configuration retrieved successfully',
      data: await gatewayConfiguration.getConfiguration(),
    });
  } catch (error) {
    next(error);
  }
}

async function updateConfiguration(req, res, next) {
  try {
    const result = await gatewayConfiguration.updateConfiguration(req.body);
    res.status(200).json({
      success: true,
      message: 'Gateway configuration updated successfully',
      data: result,
    });
  } catch (error) {
    next(error);
  }
}

module.exports = { listLogs, getMetrics, getConfiguration, updateConfiguration };