const express = require('express');
const router = express.Router();
const controller = require('../controllers/gameController');

/*
router.route('/stats')
    .post(controller.listStats);
*/

router.route("/")
    .get((_, res) => {
        res.redirect(301, '/api-docs');
    });
    
module.exports = router;