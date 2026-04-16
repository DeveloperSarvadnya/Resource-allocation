'use strict';

const { body } = require('express-validator');

const resourceValidator = [
  body('name').trim().notEmpty().withMessage('Resource name is required'),
  body('capacity')
    .optional()
    .isInt({ min: 1 })
    .withMessage('Capacity must be a positive integer'),
  body('location').optional().isString(),
  body('description').optional().isString(),
  body('isActive').optional().isBoolean(),
];

module.exports = { resourceValidator };