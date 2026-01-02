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
const { roomSocket } = require('./src/socket/roomSocket');

// env variables
const connectionString = process.env.MONGO_URI || 'mongodb://localhost:27017/stats';
const isDebug = process.env.NODE_ENV == 'debug';
const port = process.env.PORT || 3002;

// Swagger setup
const swaggerDocument = yaml.load(path.join(__dirname, './docs/swagger.yaml'));

// Mongoose setup
mongoose.connect(connectionString);

// Server setup
const app = express();
const corsOptions = {
    origin: 'http://localhost:5173',
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

// Authorization middleware
io.use(authorizationMiddleware.socketAuthorize);
app.use(authorizationMiddleware.authorize);

// Protected Socket.io handler
io.on("connection", roomSocket);

// Protected API routes
app.use('/', protectedRouter);

app.listen(port, () => {
    console.log(`Server listening on port ${port}`);
    console.log(`Swagger UI is available at http://localhost:${port}/api-docs`);
});
