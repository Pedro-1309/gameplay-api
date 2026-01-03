const mongoose = require('mongoose');
const GamePhases = require('../engine/GamePhases');

const gameSchema = new mongoose.Schema({
    _id: { type: String, required: true },
    serverUrl: { type: String, required: true },
    numbOfPlayers: { type: Number, required: true },
    gameMode: { type: String, 
        enum: ['classic', 'advanced'], 
        required: true 
    },
    players: [{
        userId: { type: String, required: true},
        name: { type: String, required: true },
        imageUrl: String,
        role: { type: String, 
            enum: ['wolf', 'villager', 'doctor', 'investigator'], 
            default: 'villager',
            required: true },
        status: {type: String, 
            enum: ['player', 'spectator', 'quit'], 
            default: 'player',
            required: true},
        result: {type: String, 
            enum: ['won', 'lost', 'playing'], 
            default: 'playing',
            required: true},
        votes:{ type: Number, default: 0 },
        _id: false // Evita di creare un _id per ogni singolo oggetto giocatore nel vettore
    }],
    phase: {type: String, 
            enum: GamePhases, 
            default: 'day',
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
