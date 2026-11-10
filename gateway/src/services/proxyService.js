const { createProxyMiddleware } = require('http-proxy-middleware');
const routeRegistry = require('./routeRegistry');
const proxyErrorHandler = require('../middleware/proxyErrorHandler');

let proxyTimeoutMs = require('../config/env').proxyTimeoutMs;
const INCOMING_TIMEOUT_MS = 15000;
let dynamicProxy;

function createDynamicProxy() {
  return createProxyMiddleware({
    changeOrigin: true,
    xfwd: true,
    proxyTimeout: proxyTimeoutMs,
    timeout: INCOMING_TIMEOUT_MS,
    router: (req) => req.gatewayRoute.target,
    pathRewrite: (path, req) =>
      routeRegistry.rewritePath(req.gatewayRoute, path),
    on: {
      error: (error, req, res) => {
        const route = req.gatewayRoute || { name: 'Unknown route' };
        proxyErrorHandler(error, req, res, route, proxyTimeoutMs);
      },
    },
  });
}

function getDynamicProxy() {
  if (!dynamicProxy) dynamicProxy = createDynamicProxy();
  return dynamicProxy;
}

module.exports = {
  createDynamicProxy,
  getDynamicProxy,
  setProxyTimeout(timeoutMs) {
    proxyTimeoutMs = timeoutMs;
    dynamicProxy = createDynamicProxy();
  },
  getProxyTimeout() {
    return proxyTimeoutMs;
  },
};
