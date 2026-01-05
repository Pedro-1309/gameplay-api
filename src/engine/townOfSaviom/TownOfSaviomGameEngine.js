const GameEngine = require('../GameEngine');
const { gameModel } = require('../../models/gameModel');
const GameEvent = require('./GameEvent');
const Role = require('./Role');
const config = require('../../configurations/townOfSaviomRoles.json');
const { fisher_yates_shuffle } = require('./utils');
const { getChannelName } = require('../../socket/gameSocket');
const Phase = require('./Phase');
const Status = require('./Status');

class TownOfSaviomGameEngine extends GameEngine {
    // in-memory reference to the game
    game;
    async init() {
        this.log(this.gameId);
        this.game = await gameModel.findById(this.gameId);
        this.log(config);
        // assign player roles
        const currentConfig = config.find(
            item => item.players === this.game.numbOfPlayers &&
                item.gameMode === this.game.gameMode
        );
        const shuffledRoles = fisher_yates_shuffle(currentConfig.roles);
        this.game.players.forEach((player, index) => {
            player.role = shuffledRoles[index];
        });
        await this.game.save();
        this.log(this.game);
    }

    // resume from database doc
    async resume(data) {
        this.game = data;
        return true;
    }

    isWerewolf(playerId) {
        return this.isRole(playerId, Role.WEREWOLF);
    }

    isStatus(playerId, status) {
        const player = this.getPlayer(playerId);
        return player && player.status === status;
    }

    isWatching(playerId) {
        return this.isStatus(playerId, Status.WATCHING);
    }

    isRole(playerId, role) {
        const player = this.getPlayer(playerId);
        return player && player.role === role;
    }

    isAccused(playerId) {
        return this.game.accused &&
            this.game.accused === playerId;
    }

    getPlayer(playerId) {
        return this.game.players.filter(
            p => p.userId === playerId
        ).at(0);
    }

    getName(playerId) {
        const player = this.getPlayer(playerId);
        return player ?
            player.name :
            undefined;
    }

    isPhase(phase) {
        return this.game.phase === phase;
    }

    isDay() {
        return this.isPhase(Phase.DAY);
    }

    isNight() {
        return this.isPhase(Phase.NIGHT);
    }

    isDefence() {
        return this.isPhase(Phase.DEFENCE);
    }

    // handle specific sub channels join on socket
    handlePlayerJoin(socket, playerId) {
        // right now watchers that weren't werewolves still can't see their messagges
        if (this.isWatching(playerId)) {
            socket.join(this.getWatchersChannel());
        }
        if (this.isWerewolf(playerId)) {
            socket.join(this.getWerewolfChannel());
        }
    }

    // handle socket event sent from a specific user
    handleSocketEvent(playerId, event, payload) {
        switch (event) {
            case GameEvent.MESSAGE:
                handlePlayerMessage(playerId, payload);
                break;
            case GameEvent.VOTE:
                handlePlayerVote(playerId, payload);
                break;
            case GameEvent.QUIT:
                handlePlayerQuitting(playerId);
                break;
            default:
        };
    }

    handlePlayerMessage(playerId, message) {
        // if the player is watching send it only to watchers
        if (this.isWatching(playerId)) {
            this.sendPlayerMessageToChannel(
                playerId,
                message,
                this.getWatchersChannel()
            )
        }
        // send normal message if is day or is the player being accused defending himself
        if (this.isDay() ||
            (this.isDefence() && this.isAccused(playerId))) {
            this.sendPlayerMessageToAll(playerId, message);
            return;
        }
        // if it's night send werewolf messages to other werewolfes
        if (this.isNight() && this.isWerewolf(playerId)) {
            this.sendPlayerMessageToChannel(
                playerId, 
                message, 
                this.getWerewolfChannel()
            );
            return;
        }
    }

    handlePlayerVote(playerId, votedPlayerId) {

    }

    handlePlayerQuitting(playerId) {
        
    }

    sendPlayerMessageToChannel(playerId, message, channel) {
        this.io.to(channel).emit(
            "MESSAGE_SENT",
            `[${this.getName(playerId)}]: ${message}`
        );
    }

    sendPlayerMessageToAll(playerId, message) {
        this.sendPlayerMessageToChannel(playerId, message, this.gameId);
    }

    sendMessageToPlayer(playerId, message) {
        this.io.to(playerId).emit(
            "MESSAGE_SENT",
            message
        );
    }

    getWerewolfChannel() {
        return getChannelName(this.gameId, Role.WEREWOLF);
    }

    getWatchersChannel() {
        return getChannelName(this.gameId, Status.WATCHING);
    }

    // operations that need to be waited by clock
    async next() { throw new Error("Not implemented yet") }
    // check if the game can continue
    canContinue() { throw new Error("Not implemented yet") }
}

module.exports = TownOfSaviomGameEngine;