'use strict';

const { body } = require('express-validator');

const scheduleValidator = [
  body('resourceId').isUUID().withMessage('resourceId must be a valid UUID'),
  body('title').trim().notEmpty().withMessage('Title is required'),
  body('startTime')
    .isISO8601()
    .withMessage('startTime must be a valid ISO 8601 datetime (with timezone offset)'),
  body('endTime')
    .isISO8601()
    .withMessage('endTime must be a valid ISO 8601 datetime (with timezone offset)'),
  body('notes').optional().isString(),
];

const recurringScheduleValidator = [
  body('resourceId').isUUID().withMessage('resourceId must be a valid UUID'),
  body('title').trim().notEmpty().withMessage('Title is required'),
  body('frequency')
    .isIn(['daily', 'weekly', 'monthly'])
    .withMessage('frequency must be daily, weekly, or monthly'),
  body('dayOfWeek')
    .optional()
    .isInt({ min: 0, max: 6 })
    .withMessage('dayOfWeek must be 0 (Sun) through 6 (Sat)'),
  body('dayOfMonth')
    .optional()
    .isInt({ min: 1, max: 31 })
    .withMessage('dayOfMonth must be 1-31'),
  body('startTime')
    .matches(/^\d{2}:\d{2}$/)
    .withMessage('startTime must be HH:MM (24h)'),
  body('endTime')
    .matches(/^\d{2}:\d{2}$/)
    .withMessage('endTime must be HH:MM (24h)'),
  body('recurStart')
    .isISO8601()
    .withMessage('recurStart must be a valid date'),
  body('recurEnd')
    .optional()
    .isISO8601()
    .withMessage('recurEnd must be a valid date'),
  body('timezone')
    .optional()
    .isString()
    .withMessage('timezone must be an IANA string'),
];

module.exports = { scheduleValidator, recurringScheduleValidator };