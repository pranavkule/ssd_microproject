const env = require('./env');

function buildDefaultRoutes() {
  return [
    {
      name: 'User Service',
      path: '/api/users',
      target: env.userServiceUrl,
      backendInstances: [
        { id: 'user-1', target: env.userServiceUrl, enabled: true },
        { id: 'user-2', target: env.userServiceUrl2, enabled: true },
      ],
      loadBalancingStrategy: 'round_robin',
      methods: ['GET', 'HEAD', 'POST', 'PUT', 'DELETE'],
      description: 'User management backend service',
      enabled: true,
      stripPrefix: false,
    },
    {
      name: 'Product Service',
      path: '/api/products',
      target: env.productServiceUrl,
      backendInstances: [
        { id: 'product-1', target: env.productServiceUrl, enabled: true },
      ],
      loadBalancingStrategy: 'round_robin',
      methods: ['GET', 'HEAD', 'POST', 'PUT', 'DELETE'],
      description: 'Product catalog backend service',
      enabled: true,
      stripPrefix: false,
    },
    {
      name: 'Order Service',
      path: '/api/orders',
      target: env.orderServiceUrl,
      backendInstances: [
        { id: 'order-1', target: env.orderServiceUrl, enabled: true },
      ],
      loadBalancingStrategy: 'round_robin',
      methods: ['GET', 'HEAD', 'POST', 'PATCH', 'DELETE'],
      description: 'Order management backend service',
      enabled: true,
      stripPrefix: false,
    },
    {
      name: 'Payment Service',
      path: '/api/payments',
      target: env.paymentServiceUrl,
      backendInstances: [
        { id: 'payment-1', target: env.paymentServiceUrl, enabled: true },
      ],
      loadBalancingStrategy: 'round_robin',
      methods: ['GET', 'HEAD', 'POST'],
      description: 'Payment simulation backend service',
      enabled: true,
      stripPrefix: false,
    },
  ];
}

module.exports = {
  buildDefaultRoutes,
};
