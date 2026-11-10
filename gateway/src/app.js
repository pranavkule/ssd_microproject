const express = require('express');
const cors = require('cors');
const env = require('./config/env');
const healthRoutes = require('./routes/healthRoutes');
const proxyRoutes = require('./routes/proxyRoutes');
const requestLogger = require('./middleware/requestLogger');
const notFound = require('./middleware/notFound');
const errorHandler = require('./middleware/errorHandler');

const app = express();

app.disable('x-powered-by');

app.use(
  cors({
    origin: env.frontendUrl,
  })
);
app.use(requestLogger);
app.use(proxyRoutes);

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use('/health', healthRoutes);

app.use(notFound);
app.use(errorHandler);

module.exports = app;
