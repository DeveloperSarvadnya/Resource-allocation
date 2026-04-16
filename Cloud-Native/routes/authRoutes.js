'use strict';

const router = require('express').Router();
const { register, login, forgotPassword, me } = require('../controllers/authController');
const { registerValidator, loginValidator, forgotPasswordValidator } = require('../validators/authValidators');
const validate      = require('../middleware/validate');
const authenticate  = require('../middleware/authenticate');

router.post('/register',        registerValidator,       validate, register);
router.post('/login',           loginValidator,          validate, login);
router.post('/forgot-password', forgotPasswordValidator, validate, forgotPassword);
router.get('/me',               authenticate,                     me);

module.exports = router;