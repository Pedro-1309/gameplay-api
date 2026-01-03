const GameEngine = require('./GameEngine');

class TownOfSaviomGameEngine extends GameEngine {
    // handle specific sub channels join on socket
    handlePlayerJoin(socket) { throw new Error("Not implemented yet") }
    // handle socket event sent from a specific user
    handleSocketEvent(userId, event, payload) { throw new Error("Not implemented yet") }
    async init() { throw new Error("Not implemented yet") }
    // operations that need to be waited by clock
    async next() { throw new Error("Not implemented yet") }
}