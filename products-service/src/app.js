
const express = require('express');
const cors = require('cors');
const productRoutes = require('./routes/products');

const app = express();


app.use(cors());
app.use(express.json());

app.get('/api/products/health', (req, res) => {
  res.json({ status: 'ok', service: 'products-service' });
});

app.use('/api/products', productRoutes);

app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({ error: 'Internal server error' });
});

module.exports = app;  // ← export so tests can import it
