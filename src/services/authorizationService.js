const jwt = require('jsonwebtoken');
const axios = require('axios');
const caUrl = process.env.AUTH_SERVICE_URL || 'http://auth-service:';
const algorithm = 'RS256';
const issuer = 'login-api';
let cachedPublicKey = null;

async function getPublicKey() {
    if (cachedPublicKey) {
        return cachedPublicKey;
    }
    try {
        const response = await axios.get(`${caUrl}/auth/public-key`);
        cachedPublicKey = response.data.publicKey;
        return cachedPublicKey;
    } catch (error) {
        console.error('Failed to fetch public key:', error.message);
        throw new Error('Auth Service Unavailable');
    }
}

exports.validateToken = async (token) => {
    const key = await getPublicKey();
    const decoded = jwt.verify(token, key, { 
        algorithms: [algorithm],
        iss: issuer
    });
    // Here we can return whatever info we need from the token
    // we are currently putting it in req.userInfo in the middleware
    return {
        id: decoded.sub,
        isAdmin: decoded.roles.includes('admin'),
        name: decoded.name,
        imageUrl: decoded.imageUrl
    };
}