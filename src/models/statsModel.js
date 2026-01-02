const mongoose = require('mongoose');

const statsSchema = new mongoose.Schema({
    _id: { type: String, required: true },
    totalGames: { type: Number, default: 0 },
    totalWins: { type: Number, default: 0 },
    // Array delle ultime 10 partite
    history: [{
        result: { type: String, 
            enum: ['won', 'lost'], 
            required: true
        },
        role: { type: String, required: true },
        numbOfPlayers: { type: Number, required: true },
        gameMode: { type: String, 
            enum: ['classic', 'advanced'], 
            required: true 
        },
        playedAt: { type: Date, default: Date.now },
        _id: false
    }]
}, {
    versionKey: false,
    toJSON: { virtuals: true },
    toObject: { virtuals: true }
});

//Numero sconfitte
statsSchema.virtual('totalLosses').get(function() {
    return this.totalGames - this.totalWins;
});

//Win Rate
statsSchema.virtual('winRate').get(function() {
    if (this.totalGames === 0) return "0%";
    const percentage = (this.totalWins / this.totalGames) * 100;
    return `${percentage.toFixed(2)}%`;
});

const statsModel = mongoose.model('results', statsSchema)
module.exports = { statsModel }
