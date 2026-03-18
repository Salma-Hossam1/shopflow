require('dotenv').config();
const express = require('express');
const cors = require('cors');
const orderRoutes = require('./routes/orders');

const app = express();
const PORT = process.env.PORT || 3003;

app.use(cors());
app.use(express.json());

app.get('/api/orders/health', (req, res) => {
  res.json({ status: 'ok', service: 'orders-service' });
});

app.use('/api/orders', orderRoutes);

app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({ error: 'Internal server error' });
});

app.listen(PORT, () => {
  console.log(`Orders service running on port ${PORT}`);
});