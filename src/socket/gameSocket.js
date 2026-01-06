const GameEvent = require('../engine/townOfSaviom/GameEvent');
const isDebug = process.env.NODE_ENV == 'debug'

log = (message) => {
    if (isDebug) {
        console.log(message);
    }
}

exports.gameSocket = (socket) => {
    const gameManager = require('../engine/GameEnginesManager');
    const userId = socket.userInfo.id;
    const name = socket.userInfo.name;
    const gameId = socket.handshake.query.gameId;

    log(`User ${name} (${userId}) trying to connect to game ${gameId}`);

    const engine = gameManager.getGame(gameId);
    if (!engine) {
        return socket.emit('error', 'Game not found');
    }
    // actual socket join
    socket.join(gameId);
    // set the socket game id for static use
    socket.gameId = gameId;

    socket.to(gameId).emit("MESSAGE_SENT", `${name} connected`);

    // to set specific user sub channels
    engine.handlePlayerJoin(socket, userId);

    log(`User ${name} joined game ${gameId}`);

    // Forward game events to the game engine
    Object.values(GameEvent).forEach(eventName => {
        socket.on(eventName, (payload) => {
            const gameId = socket.gameId;

            if (!gameId) {
                return socket.emit('error', 'You are not in an active game');
            }

            const engine = gameManager.getGame(gameId);
            if (engine) {
                engine.handleSocketEvent(socket.userInfo.id, eventName, payload);
            }
        });
    });

    registerDisconnectHandler(socket);
}

exports.getChannelName = (gameId, subChat) => {
    return subChat ? gameId + '_' + subChat : gameId;
}

// EVENT: User Disconnects
registerDisconnectHandler = (socket) => {
    socket.on("disconnecting", () => {
        console.log(`User Disconnected: ${socket.userInfo.name}`);
        // socket.rooms is a Set containing the socket ID and the rooms they joined
        const rooms = socket.rooms;

        rooms.forEach((roomId) => {
            // We don't want to broadcast to the user's private room (which is their own socket.id)
            if (roomId !== socket.id) {
                // Notify OTHER users in the room
                socket.to(roomId).emit(
                    "MESSAGE_SENT",
                    socket.userInfo.name + " disconnected"
                );
            }
        });
    });
}
