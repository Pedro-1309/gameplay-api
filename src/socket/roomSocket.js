exports.roomSocket = (socket) => {
    console.log(`User Connected: ${socket.userInfo.name} (${socket.userInfo.id})`);

    // Pass the socket to our logic handler
    registerJoinLobbyHandler(socket);
    //registerSendMessageHandler(io, socket);
    registerDisconnectHandler(socket);
}

// EVENT: User Disconnects
registerDisconnectHandler = (socket) => {
    socket.on("disconnect", () => {
        console.log(`User Disconnected: ${socket.userInfo.name} (${socket.userInfo.id})`);
        // Notify OTHER users in the room that someone left
        socket.to(roomId).emit("PLAYER_LEFT", `${socket.userInfo.name} left...`);
    });
};

// EVENT: User Joins a specific room channel
registerJoinLobbyHandler = (socket) => {
    socket.on("JOIN_LOBBY_ROOM", async (roomId) => {
        try {
            // Get the user ID from the socket (set by auth middleware)
            const userId = socket.userInfo.id; 

            // We look for a room that matches the ID AND contains this player
            const room = await Room.findOne({ 
                _id: roomId, 
                "players.userId": userId 
            });
            if (!room) {
                console.warn(`Security Alert: User ${userId} tried to join room ${roomId} but is not on the list.`);
                return; 
            }

            // Allow access
            socket.join(roomId);
            console.log(`Allowed ${socket.userInfo.name} to join socket channel ${roomId}`);

            // If the game is already started, notify the player
            if (room.status === 'PLAYING') {
                socket.emit("GAME_STARTED", {
                    // TODO add any relevant game state info here
                });
            }
        } catch (err) {
            console.error("Socket Join Error:", err);
        }
    });
}

exports.sendPlayerJoinedEvent = (io, roomId, userInfo) => {
    io.in(roomId).emit("PLAYER_JOINED", {
        name: userInfo.name,
        imageUrl: userInfo.imageUrl
    });
}

// Next features
/*
registerSendMessageHandler = (io, socket) => {
    socket.on("SEND_MESSAGE", ({ roomId, message }) => {
        console.log(`Message from ${socket.userInfo.name} in room ${roomId}: ${message}`);
        // Broadcast the message to ALL users in the room
        io.in(roomId).emit("CHAT_MESSAGE", {
            sender: socket.userInfo.name,
            text: message,
            timestamp: new Date()
        });
    });
};
*/