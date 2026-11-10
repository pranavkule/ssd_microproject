const express = require('express');
const { getDatabaseStatus } = require('./config/db');
const paymentRoutes = require('./routes/paymentRoutes');
const errorHandler = require('./middleware/errorHandler');

const app = express();
const PORT = Number(process.env.PORT) || 5007;

app.disable('x-powered-by');

app.use(express.json());

app.get('/health', (req, res) => {
  res.status(200).json({
    service: 'payment-service',
    status: 'running',
    port: PORT,
    database: getDatabaseStatus(),
    timestamp: new Date().toISOString(),
  });
});

app.use('/api/payments', paymentRoutes);

app.use((req, res) => {
  res.status(404).json({
    success: false,
    message: `Route not found: ${req.method} ${req.originalUrl}`,
    timestamp: new Date().toISOString(),
  });
});

app.use(errorHandler);

module.exports = app;
