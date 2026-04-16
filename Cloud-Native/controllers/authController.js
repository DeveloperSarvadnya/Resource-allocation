'use strict';

const jwt  = require('jsonwebtoken');
const { User } = require('../models');
const AppError = require('../utils/AppError');

const signToken = (userId) =>
  jwt.sign({ id: userId }, process.env.JWT_SECRET, {
    expiresIn: process.env.JWT_EXPIRES_IN || '7d',
  });

// POST /api/auth/register
const register = async (req, res, next) => {
  try {
    const { name, email, password, role, timezone } = req.body;

    const existing = await User.findOne({ where: { email } });
    if (existing) {
      throw new AppError('Email already registered', 409);
    }

    const user = await User.create({ name, email, password, role, timezone });
    const token = signToken(user.id);

    return res.status(201).json({ token, user: user.toSafeJSON() });
  } catch (err) {
    next(err);
  }
};

// POST /api/auth/login
const login = async (req, res, next) => {
  try {
    const { email, password } = req.body;

    const user = await User.findOne({ where: { email } });
    if (!user || !(await user.validatePassword(password))) {
      throw new AppError('Wrong email/password', 401);
    }

    const token = signToken(user.id);
    return res.json({ token, user: user.toSafeJSON() });
  } catch (err) {
    next(err);
  }
};

// POST /api/auth/forgot-password
const forgotPassword = async (req, res, next) => {
  try {
    const { email, secretCode, newPassword } = req.body;

    // Hardcoded secret code validation
    if (secretCode !== '12345') {
      throw new AppError('Invalid secret code', 403);
    }

    const user = await User.findOne({ where: { email } });
    if (!user) {
      throw new AppError('No account found with this email', 404);
    }

    // Update password (beforeUpdate hook will hash it)
    user.password = newPassword;
    await user.save();

    return res.json({ message: 'Password reset successfully. You can now log in with your new password.' });
  } catch (err) {
    next(err);
  }
};

// GET /api/auth/me
const me = async (req, res) => {
  res.json({ user: req.user.toSafeJSON() });
};

module.exports = { register, login, forgotPassword, me };