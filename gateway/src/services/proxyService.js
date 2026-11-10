const { createProxyMiddleware } = require('http-proxy-middleware');
const { pathMatchesPrefix } = require('../config/services');
const proxyErrorHandler = require('../middleware/proxyErrorHandler');

const PROXY_TIMEOUT_MS = 10000;
const INCOMING_TIMEOUT_MS = 15000;

function createServiceProxy(service) {
  return createProxyMiddleware({
    target: service.url,
    changeOrigin: true,
    xfwd: true,
    proxyTimeout: PROXY_TIMEOUT_MS,
    timeout: INCOMING_TIMEOUT_MS,
    pathFilter: (pathname) => pathMatchesPrefix(pathname, service.pathPrefix),
    on: {
      error: (error, req, res) =>
        proxyErrorHandler(error, req, res, service, PROXY_TIMEOUT_MS),
    },
  });
}

module.exports = {
  createServiceProxy,
};
