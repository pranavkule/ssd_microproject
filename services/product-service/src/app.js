const express = require('express');
const { getDatabaseStatus } = require('./config/db');
const productRoutes = require('./routes/productRoutes');
const errorHandler = require('./middleware/errorHandler');

const app = express();
const PORT = Number(process.env.PORT) || 5003;

app.disable('x-powered-by');

app.use(express.json());

app.get('/health', (req, res) => {
  res.status(200).json({
    service: 'product-service',
    status: 'running',
    port: PORT,
    database: getDatabaseStatus(),
    timestamp: new Date().toISOString(),
  });
});

app.use('/api/products', productRoutes);

app.use((req, res) => {
  res.status(404).json({
    success: false,
    message: `Route not found: ${req.method} ${req.originalUrl}`,
    timestamp: new Date().toISOString(),
  });
});

app.use(errorHandler);

module.exports = app;
