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
        res.sendStatus(403);
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