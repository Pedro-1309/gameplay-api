const { gameModel } = require('../models/gameModel');
const gameManager = require('../engine/GameEnginesManager');
const Phase = require('../engine/townOfSaviom/Phase');
const Status = require('../engine/townOfSaviom/Status');
const Role = require('../engine/townOfSaviom/Role');
const Result = require('../engine/townOfSaviom/Result');

exports.addGame = async (req, res) => {
    const room = req.body;
    let newGame;
    try {
        // 1. Map Room players to the expanded Game player structure
        const gamePlayers = room.players.map(player => ({
            userId: player.userId,
            name: player.name,
            imageUrl: player.imageUrl,
            role: Role.VILLAGER,      // Default role, engine will re-assign later
            status: Status.PLAYING,   // Or Status.ALIVE depending on your enum
            result: Result.PLAYING,   // Initial state
            votes: 0
        }));

        // 2. Construct the Game object
        newGame = new gameModel({
            _id: room._id.toString(), // Using the Room's ID as the Game's ID
            serverUrl: "http://gameplay-api:3000",
            numbOfPlayers: room.players.length,
            gameMode: room.gameMode,
            players: gamePlayers,
            phase: Phase.STARTUP      // Starting phase
        });

        // 3. Save to Database
        await newGame.save();

        gameManager.addGame(newGame._id.toString(), req.app.get('io'));

        return res.status(201).json({ gameId: newGame._id });
    } catch (error) {
        // rollback
        if (newGame) {
            newGame.deleteOne();
        }
        console.error("Error creating Game from Room:", error);
        res.sendStatus(500);
    }
};

exports.reconnect = (req, res) => {
    // TODO based on user info find the current game and return info
};