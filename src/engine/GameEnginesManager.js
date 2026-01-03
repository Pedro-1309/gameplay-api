const { gameModel } = require('../models/gameModel');
const TownOfSaviomGameEngine = require('./townOfSaviom/TownOfSaviomGameEngine');

// for the moment we use only townofsaviomengine

class GameEnginesManager {
    constructor() {
        this.gameEngines = new Map();
        this.io = null;
    }
    
    // This is called once during server startup
    async resumeGames(io) {
        this.io = io;
        console.log("Checking for active games to resume...");

        try {
            // Find games that are 'playing' and haven't ended
            const activeGamesInDb = await gameModel.find({ status: 'playing' });

            activeGamesInDb.forEach(gameData => {
                const engine = new TownOfSaviomGameEngine(gameData._id.toString(), this.io);
                
                // Pass the DB data to the engine so it knows the current phase/timer
                engine.resume(gameData); 
                
                this.gameEngines.set(gameData._id.toString(), engine);
            });

            console.log(`Resumed ${this.gameEngines.size} games.`);
        } catch (err) {
            console.error("Failed to resume games:", err);
        }
    }

    addGame(gameId, io) {
        const engine = new TownOfSaviomGameEngine(gameId, io);
        engine.init();
        this.gameEngines.set(gameId, engine);
        return engine;
    }

    getGame(gameId) {
        return this.gameEngines.get(gameId);
    }

    removeGame(gameId) {
        const engine = this.gameEngines.get(gameId);
        if (engine) engine.stop();
        this.gameEngines.delete(gameId);
    }
}

// Create the single instance
const instance = new GameEnginesManager();

// Freeze the object to ensure it's a true singleton (optional but recommended)
Object.freeze(instance);

module.exports = instance;