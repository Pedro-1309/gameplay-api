const { statsModel } = require('../models/statsModel');

exports.addResult = (req, res) => {
    const results = req.body;
    const updatePromises = results.map(data => {
        const isWin = data.result === 'won' ? 1 : 0;

        return statsModel.findOneAndUpdate(
            { _id: data._id },
            {
                $inc: { 
                    totalGames: 1, 
                    totalWins: isWin 
                },
                $push: {
                    history: {
                        $each: [{
                            result: data.result,
                            role: data.role,
                            numbOfPlayers: data.numbOfPlayers,
                            gameMode: data.gameMode,
                            playedAt: new Date()
                        }],
                        $position: 0,
                        $slice: 10
                    }
                }
            },
            { 
                upsert: true, 
                new: true, 
                setDefaultsOnInsert: true 
            }
        );
    });

    Promise.all(updatePromises)
        .then(updatedStats => {
            res.status(200).json(updatedStats);
        })
        .catch(error => res.status(500).json({ error: error.message }));
};

exports.getStats = (req, res) => {
    const userId = req.userInfo.id;
    if (!userId) {
        return res.status(400).json({ message: "ID missing in authentication info" });
    }

    statsModel.findOne({ _id: userId })
        .then(stats => {
            if (!stats) {
                return res.status(404).json({ message: "User not found" });
            }
            res.status(200).json({
                totalGames: stats.totalGames,
                totalWins: stats.totalWins,
                totalLosses: stats.totalLosses,
                winRate: stats.winRate
            });
        })
        .catch(error => res.status(500).json({ error: error.message }));
};

exports.deleteStats = (req, res) => {
    const userId = req.userInfo.id;
    if (!userId) {
        return res.status(400).json({ message: "ID missing in authentication info" });
    }

    statsModel.findOneAndDelete({ _id: userId })
        .then(deleted => {
            if (!deleted) {
                return res.status(404).json({ message: "User not found" });
            }
            res.status(200).json({ message: "Stats removed successfully" });
        })
        .catch(error => res.status(500).json({ error: error.message }));
};

exports.getHistory = (req, res) => {
    const userId = req.userInfo.id;
    if (!userId) {
        return res.status(400).json({ message: "ID missing in authentication info" });
    }

    statsModel.findOne({ _id: userId })
        .then(stats => {
            if (!stats) {
                return res.status(404).json({ message: "User not found" });
            }
            res.status(200).json(stats.history);
        })
        .catch(error => res.status(500).json({ error: error.message }));
};