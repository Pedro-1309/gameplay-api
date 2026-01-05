const GameEngine = require('../GameEngine');
const { gameModel } = require('../../models/gameModel');
const isDebug = process.env.NODE_ENV == 'debug';

class TownOfSaviomGameEngine extends GameEngine {
    game;
    // handle specific sub channels join on socket
    handlePlayerJoin(socket) { throw new Error("Not implemented yet") }
    // handle socket event sent from a specific user
    handleSocketEvent(userId, event, payload) { throw new Error("Not implemented yet") }
    async init() {
        if (isDebug) {
            console.log(this.gameId);
        }
        this.game = await gameModel.findById(this.gameId);
        if (isDebug) {
            console.log(this.game);
        }
    }
    // operations that need to be waited by clock
    async next() { throw new Error("Not implemented yet") }
    // check if the game can continue
    canContinue() { throw new Error("Not implemented yet") }
}

module.exports = TownOfSaviomGameEngine;