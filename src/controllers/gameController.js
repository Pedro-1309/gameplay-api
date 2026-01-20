const { gameModel } = require('../models/gameModel');
const gameManager = require('../engine/GameEnginesManager');
const Phase = require('../engine/townOfSaviom/Phase');
const Status = require('../engine/townOfSaviom/Status');
const Role = require('../engine/townOfSaviom/Role');
const Result = require('../engine/townOfSaviom/Result');
const axios = require('axios');

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

        await gameManager.addGame(newGame._id.toString(), req.app.get('io'));

        return res.status(201).json({ 
            gameId: newGame._id, 
            serverUrl: "http://gameplay-api:3000" 
        });
    } catch (error) {
        // rollback
        if (newGame) {
            await newGame.deleteOne();
        }
        console.error("Error creating Game from Room:", error);
        res.sendStatus(500);
    }
};

exports.getGame = async (req, res) => {
    const room = await gameModel.findById(req.params.id);
    if (!room) {
        res.sendStatus(404);
        return;
    }
    // Check that the player asking info is in fact in this game
    const requestingPlayer = room.players.find(p => p.userId == req.userInfo.id);
    if (!requestingPlayer) {
        // If the player isn't in game, but is admin, he can get game info
        if (req.userInfo.isAdmin) {
            res.json(room);
        } else {
            res.sendStatus(403);
        }
        return;
    }
    // Filter hidden informations
    const filteredPlayers = room.players.map(player => {
        const playerInfo = { ...player.toObject() };
        // Always see my role
        if (player.userId == req.userInfo.id) {
            return playerInfo;
        }
        // If I'm a WEREWOLF, show other WEREWOLFs
        if (requestingPlayer.role === Role.WEREWOLF && player.role === Role.WEREWOLF) {
            return playerInfo;
        }
        // Default: Hide the role for everyone else
        delete playerInfo.role; 
        return playerInfo;
    });

    // return the room data with the filtered players
    res.json({
        ...room.toObject(),
        players: filteredPlayers
    });
};

exports.getCurrentGame = async (req, res) => {
    // lean skips the virtual attributes
    const activeGame = await gameModel.findOne({
        "players.userId": req.userInfo.id,
        "players.status": { $in: ['PLAYING', 'WATCHING'] }
    }).select('_id serverUrl').lean();
    console.log(activeGame);
    if (activeGame) {
        activeGame.id = activeGame._id;
        delete activeGame._id;
    }
    return res.json(activeGame);
}

exports.submitGameStats = async (gameData) => {
    log(process.env.GAMEPLAY_X_INTERNAL_SERVICE_ID);
    log(process.env.X_INTERNAL_SECRET);
    const results = gameData.players.map(p => ({
            _id: p.userId,
            result: p.result,
            role: p.role,
            numbOfPlayers: gameData.numbOfPlayers,
            gameMode: gameData.gameMode
    }));
    log(results);
    const response = await axios.post(process.env.STATS_SERVICE_URL + "/results", results, {
        headers: {
            // This identifies the Lobby Service to the Game Engine
            'x-internal-service-id': process.env.GAMEPLAY_X_INTERNAL_SERVICE_ID ,
            'x-internal-secret': process.env.X_INTERNAL_SECRET 
        }
    });
    if (response.status !== 201) {
        log("Error: " + response);
    }
}