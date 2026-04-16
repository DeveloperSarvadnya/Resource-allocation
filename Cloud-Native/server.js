'use strict';

require('dotenv').config();

const express      = require('express');
const cors         = require('cors');
const sequelize    = require('./config/database');
const errorHandler = require('./middleware/errorHandler');

// Import routes
const authRoutes     = require('./routes/authRoutes');
const resourceRoutes = require('./routes/resourceRoutes');
const scheduleRoutes = require('./routes/scheduleRoutes');

// Ensure all models & associations are loaded
require('./models/index');

const app  = express();
const PORT = process.env.PORT || 3000;

// ── Global Middleware ─────────────────────────────────────────────────────────
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// ── Health Check ──────────────────────────────────────────────────────────────
app.get('/health', (_req, res) => res.json({ status: 'ok', timestamp: new Date().toISOString() }));

// ── API Routes ────────────────────────────────────────────────────────────────
app.use('/api/auth',      authRoutes);
app.use('/api/resources', resourceRoutes);
app.use('/api/schedules', scheduleRoutes);

// ── 404 handler ───────────────────────────────────────────────────────────────
app.use((_req, res) => res.status(404).json({ error: 'Route not found' }));

// ── Centralized Error Handler ─────────────────────────────────────────────────
app.use(errorHandler);

// ── Start server ──────────────────────────────────────────────────────────────
const start = async () => {
  try {
    await sequelize.authenticate();
    console.log('✅  Database connected to Supabase');

    // sync({ alter: true }) is safe for development; use migrations in production
    await sequelize.sync({ alter: false });
    console.log('✅  Sequelize models synced');

    app.listen(PORT, () => {
      console.log(`🚀  Server running on http://localhost:${PORT}`);
      console.log(`📋  Health check: http://localhost:${PORT}/health`);
    });
  } catch (err) {
    console.error('❌  Failed to start server:', err);
    process.exit(1);
  }
};

start();