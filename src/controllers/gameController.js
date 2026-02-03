const { gameModel } = require('../models/gameModel');
const gameManager = require('../engine/GameEnginesManager');
const Phase = require('../engine/townOfSaviom/Phase');
const Status = require('../engine/townOfSaviom/Status');
const Role = require('../engine/townOfSaviom/Role');
const Result = require('../engine/townOfSaviom/Result');
const axios = require('axios');

exports.addGame = async (req, res) => {
    const room = req.body;
    
    // Input Validation
    if (!room || !room.players || !room._id) {
        return res.status(400).send("Invalid Room Data");
    }

    // If the game already exists, we assume it was created successfully before.
    const existingGame = await gameModel.findById(room._id);
    if (existingGame) {
        return res.status(200).json({ 
            message: "Game already exists", 
            gameId: existingGame._id,
            serverUrl: process.env.GAME_SERVER_URL || "http://gameplay-api:3000"
        });
    }

    let newGame;
    let isSavedToDb = false; // Track if we need to rollback

    try {
        // map Room players to Game players
        const gamePlayers = room.players.map(player => ({
            userId: player.userId,
            name: player.name,
            imageUrl: player.imageUrl,
            role: Role.VILLAGER,      
            status: Status.PLAYING,   
            result: Result.PLAYING,   
            votes: 0
        }));

        // construct new Game Object
        newGame = new gameModel({
            _id: room._id.toString(), 
            serverUrl: process.env.GAME_SERVER_URL || "http://gameplay-api:3000",
            numbOfPlayers: room.players.length,
            gameMode: room.gameMode,
            players: gamePlayers,
            phase: Phase.STARTUP
        });

        await newGame.save();
        isSavedToDb = true; // Mark as saved

        // If this fails, we must trigger the rollback
        await gameManager.addGame(newGame._id.toString(), req.app.get('io'));

        return res.status(201).json({ 
            gameId: newGame._id, 
            serverUrl: newGame.serverUrl 
        });

    } catch (error) {
        console.error("Error creating Game:", error);

        // ROLLBACK STRATEGY
        // Only delete from DB if it was actually saved AND the error happened afterwards (in gameManager)
        if (isSavedToDb && newGame) {
            console.warn(`Rolling back: Deleting game ${newGame._id} due to initialization failure.`);
            await newGame.deleteOne().catch(e => console.error("Rollback failed:", e));
        }

        return res.status(500).send("Failed to initialize game instance");
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

exports.deleteRoom = async (roomId) => {
    log(process.env.GAMEPLAY_X_INTERNAL_SERVICE_ID);
    log(process.env.X_INTERNAL_SECRET);
    const response = await axios.delete(process.env.LOBBY_SERVICE_URL + `/rooms/${roomId}`, {
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