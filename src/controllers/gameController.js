const { gameModel } = require('../models/gameModel');
const gameManager = require('../managers/GameEnginesManager');

exports.addGame = (req, res) => {
    // TODO add info to database
    
    gameManager.addGame(savedGame._id.toString(), req.app.get('io'));

    return res.status(201).json({ gameId: savedGame._id });
};

exports.reconnect = (req, res) => {
    // TODO based on user info find the current game and return info
};