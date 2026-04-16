'use strict';

const router      = require('express').Router();
const ctrl        = require('../controllers/resourceController');
const authenticate = require('../middleware/authenticate');
const authorize    = require('../middleware/authorize');
const { resourceValidator } = require('../validators/resourceValidators');
const validate    = require('../middleware/validate');

router.use(authenticate);

router.get('/',    ctrl.getAll);
router.get('/:id', ctrl.getOne);

// Admin-only mutations
router.post('/',    authorize('admin'), resourceValidator, validate, ctrl.create);
router.put('/:id',  authorize('admin'), resourceValidator, validate, ctrl.update);
router.delete('/:id', authorize('admin'), ctrl.remove);

module.exports = router;