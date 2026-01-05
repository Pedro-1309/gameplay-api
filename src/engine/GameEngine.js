const isDebug = process.env.NODE_ENV == 'debug';

class GameEngine {
    constructor(gameId, io) {
        this.gameId = gameId;
        this.io = io;
        this.timer = null;
        this.phaseLoops = 30; // seconds
        this.loopDuration = 1000; // 1 second
    }

    async start() {
        this.stop();
        this.log("Timer: " + this.phaseLoops);

        // for each phase we run a timer of "phaseLoops" loops that each takes "loopDuration" milliseconds
        this.timer = setInterval(async () => {

            this.phaseLoops--;

            // at each loop we send a heartbeat to sync clients
            this.broadcast("SYNC_TIME", { time: this.phaseLoops });
            this.log("Timer: " + this.phaseLoops);

            // after "phaseLoops" loops we stop the timer, process the next phase and start a new one
            if (this.phaseLoops <= 0) {
                
                this.stop();
                
                try {
                    await this.next();
                    
                    // check if we can continue with the game or stop
                    if (canContinue()) {
                        this.start();
                    }
                } catch (err) {
                    console.error("Critical error during phase transition:", err);
                    // TODO Handle potential game crash here
                }
            }
        }, this.loopDuration);
    }

    stop() {
        if (this.timer) {
            clearInterval(this.timer);
            this.timer = null;
        }
    }

    broadcast(event, data) {
        this.broadcastToChannel(this.gameId, event, data);
    }

    broadcastToChannel(channel, eventType, data) {
        this.log(`[${channel}] ${eventType} : ${data}`);
        this.io.to(channel).emit(eventType, data);
    }

    // handle specific sub channels join on socket
    handlePlayerJoin(socket, playerId) { throw new Error("Not implemented yet") }
    // handle socket event sent from a specific user
    handleSocketEvent(userId, event, payload) { throw new Error("Not implemented yet") }
    async init() { throw new Error("Not implemented yet") }
    // operations that need to be waited by clock
    async next() { throw new Error("Not implemented yet") }
    // check if the game should continue
    canContinue() { throw new Error("Not implemented yet") }
    // resume from database doc
    resume(gameData) { throw new Error("Not implemented yet") }

    log(message) {
        if (isDebug) {
            console.log(`[${this.gameId}] ${message}`);
        }
    }
}

module.exports = GameEngine;