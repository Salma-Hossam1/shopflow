const express = require('express');
const { Pool } = require('pg');
const verifyToken = require('../middleware/verifyToken');

// NOTE: In a real project each service is a separate repo — you wouldn't
// import middleware from another service's folder. Instead you'd either:
//   1. Publish verifyToken as a shared npm package
//   2. Copy the file into each service (simple, acceptable for small teams)
// For this monorepo project, we import directly to keep it DRY.

const router = express.Router();

const pool = new Pool({
  host: process.env.DB_HOST,
  port: process.env.DB_PORT || 5432,
  database: process.env.DB_NAME,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
});

pool.query(`
  CREATE TABLE IF NOT EXISTS products (
    id SERIAL PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    description TEXT,
    price NUMERIC(10,2) NOT NULL,
    stock INTEGER DEFAULT 0,
    created_at TIMESTAMP DEFAULT NOW()
  )
`).then(() => {
  // Seed some products if table is empty
  return pool.query('SELECT COUNT(*) FROM products');
}).then(result => {
  if (result.rows[0].count === '0') {
    return pool.query(`
      INSERT INTO products (name, description, price, stock) VALUES
      ('Laptop', 'High performance laptop', 999.99, 50),
      ('Headphones', 'Noise-cancelling headphones', 199.99, 100),
      ('Keyboard', 'Mechanical keyboard', 89.99, 200)
    `);
  }
}).catch(console.error);

// GET /api/products — public, no auth needed
router.get('/', async (req, res) => {
  const result = await pool.query(
    'SELECT id, name, description, price, stock FROM products ORDER BY id'
  );
  res.json({ products: result.rows });
});

// GET /api/products/:id — public
router.get('/:id', async (req, res) => {
  const result = await pool.query(
    'SELECT id, name, description, price, stock FROM products WHERE id = $1',
    [req.params.id]
  );
  if (!result.rows[0]) return res.status(404).json({ error: 'Product not found' });
  res.json({ product: result.rows[0] });
});

// POST /api/products — protected, only authenticated users can add products
router.post('/', verifyToken, async (req, res) => {
  const { name, description, price, stock } = req.body;
  if (!name || !price) return res.status(400).json({ error: 'Name and price required' });

  const result = await pool.query(
    'INSERT INTO products (name, description, price, stock) VALUES ($1, $2, $3, $4) RETURNING *',
    [name, description, price, stock || 0]
  );
  res.status(201).json({ product: result.rows[0] });
});

// PATCH /api/products/:id/stock — called internally by orders-service to decrement stock
// In K8s, NetworkPolicy will restrict this endpoint to only be reachable from orders-service
router.patch('/:id/stock', verifyToken, async (req, res) => {
  const { quantity } = req.body;
  if (!quantity) return res.status(400).json({ error: 'Quantity required' });

  const result = await pool.query(
    `UPDATE products
     SET stock = stock - $1
     WHERE id = $2 AND stock >= $1
     RETURNING *`,
    [quantity, req.params.id]
  );

  if (!result.rows[0])
    return res.status(400).json({ error: 'Insufficient stock or product not found' });

  res.json({ product: result.rows[0] });
});

module.exports = router;