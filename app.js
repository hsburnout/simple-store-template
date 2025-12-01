const express = require('express');
const admin = require('adminjs');
const AdminJSExpress = require('@adminjs/express');
const SQLiteAdapter = require('@adminjs/sqlite');
const Stripe = require('stripe');
const bodyParser = require('body-parser');
const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const fs = require('fs');

const app = express();
const PORT = 3000;
const stripe = Stripe('sk_test_your_test_secret_key_here'); // Replace with your Stripe test secret key

app.use(bodyParser.json());
app.use(express.static(path.join(__dirname, 'public'))); // Serve frontend files

// SQLite DB setup
const dbPath = './store.db';
const db = new sqlite3.Database(dbPath);

// Create tables if they don't exist
db.serialize(() => {
  db.run(`CREATE TABLE IF NOT EXISTS products (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT, description TEXT, price REAL, image TEXT, stock INTEGER
  )`);

  db.run(`CREATE TABLE IF NOT EXISTS orders (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    product_id INTEGER, quantity INTEGER, total REAL, status TEXT
  )`);

  // Preload sample data if DB is empty
  db.get('SELECT COUNT(*) as count FROM products', (err, row) => {
    if (row.count === 0) {
      db.run(`INSERT INTO products (name, description, price, image, stock) VALUES 
        ('Sample Product 1', 'A cool item', 19.99, 'https://example.com/image1.jpg', 100),
        ('Sample Product 2', 'Another great product', 29.99, 'https://example.com/image2.jpg', 50),
        ('Sample Product 3', 'Budget option', 9.99, 'https://example.com/image3.jpg', 200)`);
    }
  });
});

// API: Get all products
app.get('/api/products', (req, res) => {
  db.all('SELECT * FROM products', [], (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(rows);
  });
});

// API: Create Stripe checkout session (with optional coupon)
app.post('/api/create-checkout', async (req, res) => {
  const { productId, quantity, coupon } = req.body;
  db.get('SELECT name, price FROM products WHERE id = ?', [productId], async (err, product) => {
    if (err || !product) return res.status(400).json({ error: 'Product not found' });
    const lineItem = {
      price_data: {
        currency: 'usd',
        product_data: { name: product.name },
        unit_amount: Math.round(product.price * 100),
      },
      quantity,
    };
    const sessionParams = {
      payment_method_types: ['card'],
      line_items: [lineItem],
      mode: 'payment',
      success_url: 'http://localhost:3000/success.html', // Create a simple success.html in /public
      cancel_url: 'http://localhost:3000/cancel.html',  // Create a simple cancel.html in /public
    };
    if (coupon) {
      sessionParams.discounts = [{ coupon }]; // Coupon ID from Stripe dashboard
    }
    try {
      const session = await stripe.checkout.sessions.create(sessionParams);
      res.json({ id: session.id });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });
});

// AdminJS setup for product/order management
admin.AdminJS.registerAdapter(SQLiteAdapter);
const adminJs = new admin.AdminJS({
  databases: [{ database: dbPath, dialect: 'sqlite' }],
  rootPath: '/admin',
  branding: { companyName: 'Your Simple Store' },
});
const adminRouter = AdminJSExpress.buildRouter(adminJs);
app.use(adminJs.options.rootPath, adminRouter);

// Stripe webhook (basic, for order fulfillment)
app.post('/webhook', bodyParser.raw({ type: 'application/json' }), (req, res) => {
  const sig = req.headers['stripe-signature'];
  // Add verification with your webhook secret from Stripe dashboard
  // For now, just log and update order status (expand as needed)
  console.log('Webhook received');
  res.json({ received: true });
});

app.listen(PORT, () => {
  console.log(`Store running on http://localhost:${PORT}`);
  console.log(`Admin panel: http://localhost:${PORT}/admin (default login: admin / password)`);
});
