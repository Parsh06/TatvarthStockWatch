'use strict';

const { verifyToken, SECURE_MODE } = require('../middleware/authenticateFirebase');

module.exports = {
  verifyToken,
  SECURE_MODE,
};
