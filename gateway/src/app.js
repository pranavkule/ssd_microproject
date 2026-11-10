const express = require('express');
const cors = require('cors');
const env = require('./config/env');
const healthRoutes = require('./routes/healthRoutes');
const routeManagementRoutes = require('./routes/routeManagementRoutes');
const proxyRoutes = require('./routes/proxyRoutes');
const notFound = require('./middleware/notFound');
const errorHandler = require('./middleware/errorHandler');

const app = express();

app.disable('x-powered-by');

app.use(
  cors({
    origin: env.frontendUrl,
    preflightContinue: true,
    optionsSuccessStatus: 204,
  })
);
app.use((req, res, next) => {
  if (
    req.method === 'OPTIONS' &&
    req.get('Origin') &&
    req.get('Access-Control-Request-Method')
  ) {
    return res.sendStatus(204);
  }

  return next();
});

app.use(
  '/api/gateway/routes',
  express.json({ limit: '100kb' }),
  routeManagementRoutes
);
app.use('/health', healthRoutes);
app.use(proxyRoutes);

app.use(notFound);
app.use(errorHandler);

module.exports = app;
