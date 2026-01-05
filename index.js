const express = require('express');
const http = require('http');
const cors = require('cors');
const yaml = require('yamljs');
const path = require('path');
const mongoose = require('mongoose');
const swaggerUi = require('swagger-ui-express');
const { Server } = require("socket.io");
const protectedRouter = require('./src/routes/protectedRouter');
const publicRouter = require('./src/routes/publicRouter');
const authorizationMiddleware = require('./src/middlewares/authorizationMiddleware');
const { gameSocket } = require('./src/socket/gameSocket');
const gameController = require('./src/controllers/gameController');
const gameManager = require('./src/engine/GameEnginesManager');

// env variables
const connectionString = process.env.MONGO_URI || 'mongodb://localhost:27017/game';
const isDebug = process.env.NODE_ENV == 'debug';
const allowedOrigin = process.env.CORS_ORIGIN || "http://localhost:5173";

// Swagger setup
const swaggerDocument = yaml.load(path.join(__dirname, './docs/swagger.yaml'));

// Server setup
const app = express();
const corsOptions = {
    origin: allowedOrigin,
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization']
};
app.use(cors(corsOptions));
app.use(express.json());
app.use(express.static('public'));
// Handle preflight requests
app.options('*', cors(corsOptions));

// Socket.io setup
const httpServer = http.createServer(app);
const io = new Server(httpServer, {
    cors: corsOptions
});
app.set('io', io);

// Debugging middleware
if (isDebug) {
    app.use((req, _, next) => {
        console.log(`[DEBUG] Request received: ${req.method} ${req.originalUrl}`);
        next();
    });
}

// Swagger UI setup
app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerDocument));

// Public API routes
app.use('/', publicRouter);

// Internal API routes
app.post('/games', authorizationMiddleware.internalAuthorize, gameController.addGame)

// Authorization middleware
io.use(authorizationMiddleware.socketAuthorize);
app.use(authorizationMiddleware.authorize);

// Protected Socket.io handler
io.on("connection", gameSocket);

// Protected API routes
app.use('/', protectedRouter);

// Mongoose setup
mongoose.connect(connectionString).then(() => {
    // Start the Manager and resume games from DB
    gameManager.resumeGames(io);
    // Start app only after db connectiona and games are resumed
    app.listen(3000, () => console.log("Server started"));
});
