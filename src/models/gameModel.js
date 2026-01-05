const mongoose = require('mongoose');
const Phase = require('../engine/townOfSaviom/Phase');
const Status = require('../engine/townOfSaviom/Status');
const Role = require('../engine/townOfSaviom/Role');
const Result = require('../engine/townOfSaviom/Result');
const GameMode = require('../engine/townOfSaviom/GameMode');

const gameSchema = new mongoose.Schema({
    _id: { type: String, required: true },
    serverUrl: { type: String, required: true },
    numbOfPlayers: { type: Number, required: true },
    gameMode: { type: String, 
        enum: GameMode, 
        required: true
    },
    players: [{
        userId: { type: String, required: true},
        name: { type: String, required: true },
        imageUrl: String,
        role: { type: String, 
            enum: Role, 
            default: Role.VILLAGER,
            required: true },
        status: {type: String, 
            enum: Status, 
            default: Status.PLAYING,
            required: true},
        result: {type: String, 
            enum: Result, 
            default: Result.PLAYING,
            required: true},
        votes:{ type: Number, default: 0 },
        _id: false // Evita di creare un _id per ogni singolo oggetto giocatore nel vettore
    }],
    phase: {type: String, 
            enum: Phase, 
            default: Phase.STARTUP,
            required: true},
}, {
    versionKey: false,
    toJSON: { virtuals: true },
    toObject: { virtuals: true }
});

gameSchema.virtual('wolvesAlive').get(function() {
    return this.players.filter(p => p.role === 'wolf' && p.status === 'player').length;
});

gameSchema.virtual('playersAlive').get(function() {
    return this.players.filter(p => p.status === 'player').length;
});

gameSchema.virtual('gameStatus').get(function() {
    const wolves = this.wolvesAlive;
    const totalAlive = this.playersAlive;
    const villagers = totalAlive - wolves;

    if (wolves === 0) {
        return { over: true, winner: 'villagers' };
    }
    
    if (wolves >= villagers) {
        return { over: true, winner: 'wolves' };
    }

    return { over: false, winner: null };
});

const gameModel = mongoose.model('game', gameSchema)
module.exports = { gameModel }
