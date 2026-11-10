const env = require('./env');

const serviceRegistry = Object.freeze({
  user: Object.freeze({
    key: 'user',
    name: 'user-service',
    label: 'User service',
    url: env.userServiceUrl,
    pathPrefix: '/api/users',
    routingEnabled: true,
  }),
  user2: Object.freeze({
    key: 'user2',
    name: 'user-service-2',
    label: 'User service instance 2',
    url: env.userServiceUrl2,
    pathPrefix: '/api/users',
    routingEnabled: false,
  }),
  product: Object.freeze({
    key: 'product',
    name: 'product-service',
    label: 'Product service',
    url: env.productServiceUrl,
    pathPrefix: '/api/products',
    routingEnabled: true,
  }),
  order: Object.freeze({
    key: 'order',
    name: 'order-service',
    label: 'Order service',
    url: env.orderServiceUrl,
    pathPrefix: '/api/orders',
    routingEnabled: true,
  }),
  payment: Object.freeze({
    key: 'payment',
    name: 'payment-service',
    label: 'Payment service',
    url: env.paymentServiceUrl,
    pathPrefix: '/api/payments',
    routingEnabled: true,
  }),
});

const proxiedServices = Object.freeze(
  Object.values(serviceRegistry).filter((service) => service.routingEnabled)
);

function pathMatchesPrefix(pathname, prefix) {
  return pathname === prefix || pathname.startsWith(`${prefix}/`);
}

function findProxiedServiceByPath(pathname) {
  return proxiedServices.find((service) => pathMatchesPrefix(pathname, service.pathPrefix));
}

function getServiceSummaries() {
  return Object.values(serviceRegistry).map((service) => ({
    name: service.name,
    url: service.url,
    pathPrefix: service.pathPrefix,
    routingEnabled: service.routingEnabled,
  }));
}

module.exports = {
  serviceRegistry,
  proxiedServices,
  pathMatchesPrefix,
  findProxiedServiceByPath,
  getServiceSummaries,
};
