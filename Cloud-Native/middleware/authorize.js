'use strict';

/**
 * authorize(...roles)
 * Middleware factory — only users whose role is in the allowed list pass through.
 * Must be used AFTER authenticate middleware.
 *
 * Role hierarchy: admin > manager > user
 */
const authorize = (...allowedRoles) => {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ error: 'Not authenticated' });
    }

    if (!allowedRoles.includes(req.user.role)) {
      return res.status(403).json({
        error: `Access denied. Required role(s): ${allowedRoles.join(', ')}`,
      });
    }

    next();
  };
};

module.exports = authorize;