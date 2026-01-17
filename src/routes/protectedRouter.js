const express = require('express');
const router = express.Router();
const controller = require('../controllers/gameController');

router.route('/games/:id')
    .get(controller.getGame);

router.route('/status')
    .get(controller.getCurrentGame);

module.exports = router;