const gameManager = require('../engine/GameEnginesManager');
const isDebug = process.env.NODE_ENV == 'debug'
const GAME_EVENTS = ['VOTE', 'QUIT', 'MESSAGE'];

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
        engine.handlePlayerJoin(socket);

        if (isDebug) {
            console.log(`User ${name} joined game ${gameId}`);
        }
    });

    // Forward game events to the game engine
    GAME_EVENTS.forEach(eventName => {
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
                socket.to(roomId).emit("PLAYER_LEFT", {
                    id: socket.userInfo.id,
                    name: socket.userInfo.name,
                    imageUrl: socket.userInfo.imageUrl
                });
            }
        });
    });
}
