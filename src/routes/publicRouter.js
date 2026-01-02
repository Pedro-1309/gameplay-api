const express = require('express');
const router = express.Router();
const controller = require('../controllers/statsController');

/*
router.route('/stats')
    .post(controller.listStats);
*/

router.route('/result')
    .post(controller.addResult)

module.exports = router;