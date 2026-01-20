const express = require('express');
const router = express.Router();

/*
router.route('/stats')
    .post(controller.listStats);
*/

router.route("/")
    .get((_, res) => {
        res.redirect(301, '/api-docs');
    });
    
module.exports = router;