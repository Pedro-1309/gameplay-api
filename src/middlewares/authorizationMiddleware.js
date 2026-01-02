const {validateToken} = require('../services/authorizationService');

exports.authorize = async (req, res, next) => {
    const authHeader = req.headers['authorization']
    console.log(authHeader);
    // Header format is: "Bearer <token>"
    const token = authHeader && authHeader.split(' ')[1];

    if (!token) {
        return res.sendStatus(401);
    }

    try {
        req.userInfo = await validateToken(token);
    } catch (err) {
        console.error(err);
        return res.sendStatus(403);
    }
    next();
};

exports.socketAuthorize = async (socket, next) => {
    const token = socket.handshake.auth.token;
    if (!token) {
        return res.sendStatus(401);
    }
    try {
        socket.userInfo = await validateToken(token);
    } catch (err) {
        console.error(err);
        return res.sendStatus(403);
    }
    next();
};