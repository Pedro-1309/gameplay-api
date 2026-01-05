const { gameModel } = require('../models/gameModel');
const TownOfSaviomGameEngine = require('./townOfSaviom/TownOfSaviomGameEngine');
const Phase = require('./townOfSaviom/Phase');

// for the moment we use only townofsaviomengine

class GameEnginesManager {
    constructor() {
        this.gameEngines = new Map();
    }
    
    // This is called once during server startup
    async resumeGames(io) {
        console.log("Checking for active games to resume...");

        try {
            // Find games that are 'playing' and haven't ended
            const activeGamesInDb = await gameModel.find({ 
                phase: { $ne: Phase.GAME_OVER } 
            });

            const resumePromises = activeGamesInDb.map(async (gameData) => {
                const gameId = gameData._id.toString();
                const engine = new TownOfSaviomGameEngine(gameId, io);
                
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

    async addGame(gameId, io) {
        const engine = new TownOfSaviomGameEngine(gameId, io);
        await engine.init();
        engine.start();
        this.gameEngines.set(gameId, engine);
        return engine;
    }

    getGame(gameId) {
        return this.gameEngines.get(gameId);
    }
}

// Create the single instance
const instance = new GameEnginesManager();

// Freeze the object to ensure it's a true singleton (optional but recommended)
Object.freeze(instance);

module.exports = instance;