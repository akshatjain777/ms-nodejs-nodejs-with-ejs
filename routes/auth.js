const express = require('express');
const { check, body } = require('express-validator/check');

const authController = require('../controllers/auth');
const User = require('../models/user');

const router = express.Router();

router.get('/login', authController.getLogin);

router.get('/signup', authController.getSignup);

router.get('/reset', authController.getReset);

router.get('/reset/:token', authController.getNewPassword);

router.post('/login',
  [
    check('email')
    .isEmail()
    .withMessage('Invalid Email')
    .normalizeEmail(),
    body('password', 'Password must contain only numbers and alphabets with at least 5 characters.')
    .isLength({ min: 5})
    .isAlphanumeric()
    .trim()
  ],
  authController.postLogin
);

router.post(
  '/signup',
  [
    check('email')
    .isEmail()
    .withMessage('Invalid Email')
    .custom((value, {req}) => {
      return User.findOne({ email: value })
      .then(userDoc => {
        if(userDoc) {
          return Promise.reject('Email Already Exists.');
        }
      })
      // if(value === 'max@max.com') {
      //   throw new Error('Email address forbidden');
      // }
      // return true;
    })
    .normalizeEmail(),
    body('password', 'Password must contain only numbers and alphabets with at least 5 characters.')
    .isLength({ min: 5})
    .isAlphanumeric()
    .trim(),
    body('confirmPassword')
    .trim()
    .custom((value, {req}) => {
      if (value !== req.body.password) {
        throw new Error(`Password's doesn't match`);
      }
      return true
    })
  ],
  authController.postSignup
);

router.post('/reset', authController.postReset);

router.post('/new-password', authController.postNewPassword);

router.post('/logout', authController.postLogout);

module.exports = router;
