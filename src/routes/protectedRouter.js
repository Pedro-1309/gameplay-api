const express = require('express');
const router = express.Router();
const controller = require('../controllers/gameController');

router.route('/games/:id')
    .get(controller.getGame);

module.exports = router;