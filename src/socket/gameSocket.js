const gameManager = require('../engine/GameEnginesManager');
const GameEvent = require('../engine/townOfSaviom/GameEvent');
const isDebug = process.env.NODE_ENV == 'debug'

exports.gameSocket = (socket) => {
    const userId = socket.userInfo.id;
    const { name } = socket.userInfo;

    if (isDebug) {
        console.log(`User Connected: ${name} (${userId})`);
    }

    // Join the specific game room
    socket.on('JOIN', ({ gameId }) => {
        const engine = gameManager.getGame(gameId);
        
        if (!engine) {
            return socket.emit('error', 'Game not found');
        }
        // actual socket join
        socket.join(gameId);
        // set the socket game id for static use
        socket.gameId = gameId;

        // to set specific user sub channels
        engine.handlePlayerJoin(socket, userId);

        if (isDebug) {
            console.log(`User ${name} joined game ${gameId}`);
        }
    });

    // Forward game events to the game engine
    GameEvent.forEach(eventName => {
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
