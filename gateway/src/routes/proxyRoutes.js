const express = require('express');
const { proxiedServices } = require('../config/services');
const { createServiceProxy } = require('../services/proxyService');

const router = express.Router();

proxiedServices.forEach((service) => {
  router.use(createServiceProxy(service));
});

module.exports = router;
