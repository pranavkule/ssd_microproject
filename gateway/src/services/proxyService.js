const { createProxyMiddleware } = require('http-proxy-middleware');
const routeRegistry = require('./routeRegistry');
const proxyErrorHandler = require('../middleware/proxyErrorHandler');

const PROXY_TIMEOUT_MS = 10000;
const INCOMING_TIMEOUT_MS = 15000;

function createDynamicProxy() {
  return createProxyMiddleware({
    changeOrigin: true,
    xfwd: true,
    proxyTimeout: PROXY_TIMEOUT_MS,
    timeout: INCOMING_TIMEOUT_MS,
    router: (req) => req.gatewayRoute.target,
    pathRewrite: (path, req) =>
      routeRegistry.rewritePath(req.gatewayRoute, path),
    on: {
      error: (error, req, res) => {
        const route = req.gatewayRoute || { name: 'Unknown route' };
        proxyErrorHandler(error, req, res, route, PROXY_TIMEOUT_MS);
      },
    },
  });
}

module.exports = {
  createDynamicProxy,
};
