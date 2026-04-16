'use strict';

const router      = require('express').Router();
const ctrl        = require('../controllers/scheduleController');
const authenticate = require('../middleware/authenticate');
const authorize    = require('../middleware/authorize');
const { scheduleValidator, recurringScheduleValidator } = require('../validators/scheduleValidators');
const validate    = require('../middleware/validate');

router.use(authenticate);

// ── Predictive suggestions  (all authenticated roles) ────────
// Must be defined BEFORE /:id so Express doesn't treat
// 'suggestions' or 'analytics' as a UUID param
router.get('/suggestions', ctrl.getSuggestions);
router.get('/analytics/:resourceId', ctrl.getAnalytics);

// ── Recurring schedules (admin / manager) ────────────────────
router.get('/recurring',
  authorize('admin', 'manager'),
  ctrl.getRecurring
);
router.post('/recurring',
  authorize('admin', 'manager'),
  recurringScheduleValidator,
  validate,
  ctrl.createRecurring
);

// ── Individual schedules ──────────────────────────────────────
router.get('/',     ctrl.getAll);
router.get('/:id',  ctrl.getOne);
router.post('/',    scheduleValidator, validate, ctrl.create);
router.put('/:id',  scheduleValidator, validate, ctrl.update);
router.delete('/:id', ctrl.cancel);

module.exports = router;