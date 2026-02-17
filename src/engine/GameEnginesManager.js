const { gameModel } = require('../models/gameModel');
const TownOfSaviomClassic = require('./townOfSaviom/TownOfSaviomClassic');
const Phase = require('./townOfSaviom/Phase');

// for the moment we use only townofsaviomengine

class GameEnginesManager {
    constructor() {
        this.gameEngines = new Map();
        this.io = null; // Socket.IO instance will be set later
    }

    setIO(io) {
        this.io = io;
    }
    
    // This is called once during server startup
    async resumeGames() {
        console.log("Checking for active games to resume...");

        try {
            // Find games that are 'playing' and haven't ended
            const activeGamesInDb = await gameModel.find({ 
                phase: { $ne: Phase.GAMEOVER } 
            });

            const resumePromises = activeGamesInDb.map(async (gameData) => {
                const gameId = gameData._id.toString();
                const engine = new TownOfSaviomClassic(gameId, this.io);
                
                await engine.resume(gameData);
                await engine.start();
                
                this.gameEngines.set(gameId, engine);
            });

            // Wait for every single game to finish resuming
            await Promise.all(resumePromises);

            console.log(`Resumed ${this.gameEngines.size} games.`);
        } catch (err) {
            console.error("Failed to resume games:", err);
        }
    }

    async loadGame(gameId) {
        if (this.gameEngines.has(gameId)) {
            return this.gameEngines.get(gameId);
        }
        console.log(`[Failover] Attempting to load game ${gameId} from DB...`);
        const gameData = await gameModel.findOneAndUpdate(
            { _id: gameId },
            { $set: { activeServerId: process.env.SERVER_ID } },
            { new: true }
        );
        if (!gameData || gameData.phase === Phase.GAMEOVER) {
            console.warn(`Game ${gameId} not found or finished.`);
            return null;
        }
        const engine = new TownOfSaviomClassic(gameId, this.io);
        await engine.resume(gameData);
        await engine.start();
        this.gameEngines.set(gameId, engine);
        console.log(`[Failover] Successfully recovered game ${gameId}`);
        return engine;
    }

    async addGame(gameId, io) {
        const engine = new TownOfSaviomClassic(gameId, io);
        await engine.init();
        engine.start();
        this.gameEngines.set(gameId, engine);
        return engine;
    }

    getGame(gameId) {
        return this.gameEngines.get(gameId);
    }

    stopGame(gameId) {
        // Stop the game engine and remove it from the map
        const engine = this.gameEngines.get(gameId);
        if (engine) {
            engine.stop();
            this.gameEngines.delete(gameId);
        }
    }
}

// Create the single instance
const instance = new GameEnginesManager();

module.exports = instance;