const mongoose = require('mongoose');
const Phase = require('../engine/townOfSaviom/Phase');
const Status = require('../engine/townOfSaviom/Status');
const Role = require('../engine/townOfSaviom/Role');
const Result = require('../engine/townOfSaviom/Result');
const GameMode = require('../engine/townOfSaviom/GameMode');
const VoteType = require('../engine/townOfSaviom/VoteType');    

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
        role: { 
            type: String, 
            enum: Role, 
            default: Role.VILLAGER,
            required: true 
        },
        status: {
            type: String, 
            enum: Status, 
            default: Status.PLAYING,
            required: true
        },
        result: {
            type: String, 
            enum: Result, 
            default: Result.PLAYING,
            required: true
        },
        votes:{ type: Number, default: 0 },
        voting: String,
        vote: {
            type: String,
            enum: [VoteType.GUILTY, VoteType.INNOCENT, VoteType.ACTION],
            default: VoteType.ACTION,
            required: false
        },
        _id: false // Evita di creare un _id per ogni singolo oggetto giocatore nel vettore
    }],
    phase: {type: String, 
            enum: Phase, 
            default: Phase.STARTUP,
            required: true},
    phaseDuration: { type: Number, default: 30 }, // in seconds
    phaseTimeLeft: { type: Number, default: 30 }, // in seconds
    defenceStartingTick: { type: Number, default: 0 }, // in seconds
    accused: String,
    createdAt: { 
        type: Date, 
        default: Date.now,
        expires: 86400     // 1 day (24 * 60 * 60)
    },
    activeServerId: { type: String }
}, {
    toJSON: { 
        virtuals: true,
        transform: function (doc, ret) {
            ret.id = ret._id.toString();
            delete ret._id;
            return ret;
        }
    },
    toObject: { virtuals: true }
});

gameSchema.virtual('werewolfAlive').get(function() {
    return this.players.filter(p => p.role === Role.WEREWOLF && p.status === Status.PLAYING).length;
});

gameSchema.virtual('playersAlive').get(function() {
    return this.players.filter(p => p.status === Status.PLAYING).length;
});

gameSchema.virtual('guiltyVotes').get(function() {
    return this.players.filter(
        p => p.vote === VoteType.GUILTY && 
            p.status === Status.PLAYING && p.voting
    ).length;
});

gameSchema.virtual('innocentVotes').get(function() {
    return this.players.filter(
        p => p.vote === VoteType.INNOCENT && 
            p.status === Status.PLAYING && p.voting
    ).length;
});

gameSchema.index({ "players.userId": 1, "players.status": 1 });

const gameModel = mongoose.model('game', gameSchema)
module.exports = { gameModel }
