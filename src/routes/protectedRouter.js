const express = require('express');
const router = express.Router();
const controller = require('../controllers/statsController');

router.route('/stats')
    .get(controller.getStats)
    .delete(controller.deleteStats);

router.route('/history')
    .get(controller.getHistory);

module.exports = router;