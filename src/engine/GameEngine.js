const isDebug = process.env.NODE_ENV == 'debug';

class GameEngine {
    constructor(gameId, io) {
        this.gameId = gameId;
        this.io = io;
        this.timer = null;
        this.remainingTicksOfThisPhase = 30; // seconds
        this.tickDuration = 1000; // 1 second
    }
    
    _saveQueue = Promise.resolve();

    async queueSave() {
        this._saveQueue = this._saveQueue.then(async () => {
            try {
                await this.game.save();
                this.log("Game document saved successfully.");
            } catch (err) {
                this.error("Failed to save game document:", err);
            }
        });
        return this._saveQueue;
    }

    async start() {
        this.stop(); // Clear any existing timer
        this.log("Timer: " + this.remainingTicksOfThisPhase);

        const tick = async () => {
            this.remainingTicksOfThisPhase--;
            this.broadcast("SYNC_TIME", { time: this.remainingTicksOfThisPhase });
            this.log("Timer: " + this.remainingTicksOfThisPhase);

            if (this.remainingTicksOfThisPhase <= 0) {
                try {
                    await this.nextPhase();
                    if (this.canContinue()) {
                        this.timer = setTimeout(tick, this.tickDuration);
                    }
                } catch (err) {
                    console.error("Critical error:", err);
                }
            } else {
                // Schedule the next loop
                this.timer = setTimeout(tick, this.tickDuration);
            }
        };

        this.timer = setTimeout(tick, this.tickDuration);
    }

    stop() {
        if (this.timer) {
            clearTimeout(this.timer); // Use clearTimeout for setTimeout
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
    // operations before engine start
    async init() { throw new Error("Not implemented yet") }
    // operations that must be done between each phase (need to RESET remainingTicksOfThisPhase)
    async nextPhase() { throw new Error("Not implemented yet") }
    // check if the game should continue (checked after next())
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