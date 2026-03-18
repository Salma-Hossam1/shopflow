const express = require('express');
const { Pool } = require('pg');
const fetch = require('node-fetch');
const verifyToken = require('../middleware/verifyToken');

const router = express.Router();

const pool = new Pool({
  host: process.env.DB_HOST,
  port: process.env.DB_PORT || 5432,
  database: process.env.DB_NAME,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
});

// These URLs come from environment variables.
// In Docker Compose: service names resolve via Docker's internal DNS.
// In K8s: these will be K8s Service DNS names like:
//   http://products-service.shopflow-dev.svc.cluster.local:3002
// We use env vars so the same code works in both environments.
const PRODUCTS_SERVICE_URL = process.env.PRODUCTS_SERVICE_URL;

pool.query(`
  CREATE TABLE IF NOT EXISTS orders (
    id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL,
    user_email VARCHAR(255) NOT NULL,
    product_id INTEGER NOT NULL,
    product_name VARCHAR(255) NOT NULL,
    quantity INTEGER NOT NULL,
    total_price NUMERIC(10,2) NOT NULL,
    status VARCHAR(50) DEFAULT 'pending',
    created_at TIMESTAMP DEFAULT NOW()
  )
`).catch(console.error);

// POST /api/orders — create an order
// This is where inter-service communication happens:
//   1. Verify user token (local JWT check)
//   2. Fetch product details from products-service
//   3. Reserve stock in products-service
//   4. Save order to own DB
router.post('/', verifyToken, async (req, res) => {
  const { product_id, quantity } = req.body;

  if (!product_id || !quantity)
    return res.status(400).json({ error: 'product_id and quantity required' });

  // Step 1: Get product details
  // We pass the Authorization header forward — this is called "header propagation"
  // and is important for tracing and auth in microservices
  const productRes = await fetch(`${PRODUCTS_SERVICE_URL}/api/products/${product_id}`, {
    headers: { Authorization: req.headers['authorization'] }
  });

  if (!productRes.ok)
    return res.status(404).json({ error: 'Product not found' });

  const { product } = await productRes.json();

  // Step 2: Check stock
  if (product.stock < quantity)
    return res.status(400).json({ error: `Insufficient stock. Available: ${product.stock}` });

  // Step 3: Decrement stock in products-service
  // This is a simple approach — in production you'd use a saga pattern
  // or distributed transaction to handle partial failures
  const stockRes = await fetch(`${PRODUCTS_SERVICE_URL}/api/products/${product_id}/stock`, {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
      Authorization: req.headers['authorization']
    },
    body: JSON.stringify({ quantity })
  });

  if (!stockRes.ok)
    return res.status(400).json({ error: 'Failed to reserve stock' });

  // Step 4: Create the order in our own DB
  const total_price = (product.price * quantity).toFixed(2);

  const result = await pool.query(
    `INSERT INTO orders (user_id, user_email, product_id, product_name, quantity, total_price)
     VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
    [req.user.userId, req.user.email, product_id, product.name, quantity, total_price]
  );

  res.status(201).json({ order: result.rows[0] });
});

// GET /api/orders — get all orders for the authenticated user
router.get('/', verifyToken, async (req, res) => {
  const result = await pool.query(
    'SELECT * FROM orders WHERE user_id = $1 ORDER BY created_at DESC',
    [req.user.userId]
  );
  res.json({ orders: result.rows });
});

// GET /api/orders/:id
router.get('/:id', verifyToken, async (req, res) => {
  const result = await pool.query(
    'SELECT * FROM orders WHERE id = $1 AND user_id = $2',
    [req.params.id, req.user.userId]
  );
  if (!result.rows[0]) return res.status(404).json({ error: 'Order not found' });
  res.json({ order: result.rows[0] });
});

module.exports = router;