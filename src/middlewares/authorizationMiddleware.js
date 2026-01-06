const {validateToken} = require('../services/authorizationService');
const isDebug = process.env.NODE_ENV == 'debug';

log = (message) => {
    if (isDebug) {
        console.log(message);
    }
}

exports.authorize = async (req, res, next) => {
    const authHeader = req.headers['authorization'];
    log(authHeader);
    // Header format is: "Bearer <token>"
    const token = authHeader && authHeader.split(' ')[1];

    if (!token) {
        return res.sendStatus(401);
    }

    try {
        req.userInfo = await validateToken(token);
    } catch (err) {
        log(err);
        return res.sendStatus(403);
    }
    next();
};

exports.socketAuthorize = async (socket, next) => {
    const token = socket.handshake.auth.token;
    log("Token: " + token);
    if (!token) {
        return res.sendStatus(401);
    }
    try {
        socket.userInfo = await validateToken(token);
    } catch (err) {
        log(err);
        return res.sendStatus(403);
    }
    next();
};

exports.internalAuthorize = async (req, res, next) => {
    const internalSecret = req.headers['x-internal-secret'];
    const internalServiceId = req.headers['x-internal-service-id'];

    log(internalServiceId);
    log(internalSecret);

    if (!internalSecret || !internalServiceId) {
        return res.sendStatus(401);
    }

    if (internalServiceId != process.env.LOBBY_X_INTERNAL_SERVICE_ID || internalSecret != process.env.X_INTERNAL_SECRET) {
        return res.sendStatus(403);
    }

    next();
}