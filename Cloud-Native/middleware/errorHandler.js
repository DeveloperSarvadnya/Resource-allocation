'use strict';

// eslint-disable-next-line no-unused-vars
const errorHandler = (err, req, res, next) => {
  console.error('[ERROR]', err);

  // Sequelize validation errors
  if (err.name === 'SequelizeValidationError' || err.name === 'SequelizeUniqueConstraintError') {
    const messages = err.errors.map((e) => e.message);
    return res.status(422).json({ error: 'Validation error', details: messages });
  }

  // Sequelize DB errors
  if (err.name === 'SequelizeDatabaseError') {
    return res.status(500).json({ error: 'Database error', detail: err.message });
  }

  // JWT errors (should normally be caught in authenticate, but just in case)
  if (err.name === 'JsonWebTokenError' || err.name === 'TokenExpiredError') {
    return res.status(401).json({ error: 'Invalid or expired token' });
  }

  // Application-level errors thrown with a statusCode
  if (err.statusCode) {
    return res.status(err.statusCode).json({ error: err.message, details: err.details });
  }

  // Default
  return res.status(500).json({
    error: 'Internal server error',
    ...(process.env.NODE_ENV === 'development' && { detail: err.message }),
  });
};

module.exports = errorHandler;