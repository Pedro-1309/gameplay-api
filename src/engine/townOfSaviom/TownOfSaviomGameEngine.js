const GameEngine = require('../GameEngine');
const { gameModel } = require('../../models/gameModel');
const GameEvent = require('./GameEvent');
const Role = require('./Role');
const config = require('../../configurations/townOfSaviomRoles.json');
const { fisher_yates_shuffle } = require('./utils');
const { getChannelName } = require('../../socket/gameSocket');
const Phase = require('./Phase');
const Status = require('./Status');
const TICKS_PER_DAY = 120;
const TICKS_PER_NIGHT = 60;
const TICKS_PER_STARTUP = 30;
const EXTRA_TICKS_AFTER_DEFENCE = 20;

class TownOfSaviomGameEngine extends GameEngine {
    // in-memory reference to the game
    game;
    defenceStartingTick;
    phasesWithNoKills = 0;
    async init() {
        // get game from db
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
        // save
        await this.game.save();
        this.log(this.game);
        // set ticks for startup
        this.remainingTicksOfThisPhase = TICKS_PER_STARTUP;
    }

    // resume from database doc
    async resume(data) {
        this.game = data;
        switch (this.game.phase) {
            case Phase.STARTUP:
                this.remainingTicksOfThisPhase = TICKS_PER_STARTUP;
                break;
            case Phase.DEFENCE:
            case Phase.DAY:
                this.startDay();
                break;
            case Phase.NIGHT:
                this.startNight();
                break;
            default:
                throw new Error("Game already ended");
        }
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

    isStartup() {
        return this.isPhase(Phase.STARTUP);
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
        this.log(`received event ${event} from player ${playerId} with payload ${payload}`);
        switch (event) {
            case GameEvent.MESSAGE:
                this.handlePlayerMessage(playerId, payload);
                break;
            case GameEvent.VOTE:
                this.handlePlayerVote(playerId, payload);
                break;
            case GameEvent.QUIT:
                this.handlePlayerQuitting(playerId);
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
        // send normal message if is day, startup or 
        // is the player being accused defending himself
        if (this.isDay() || this.isStartup() ||
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
        // otherwise no message is sent
    }

    handlePlayerVote(playerId, votedPlayerId) {
        // TODO set votes and change to defence phase
    }

    handlePlayerQuitting(playerId) {
        // TODO
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

    // operations that must be done between each phase
    async nextPhase() {
        switch (this.game.phase) {
            // if day or startup end then start a new night
            case Phase.DAY:
            case Phase.STARTUP:
                this.startNight();
                break;
            // if night end process a werewolf kill then start a new day
            case Phase.NIGHT:
                this.processWerewolfKill();
                this.startDay();
                break;
            // if defence end process the accused kill then resume the day
            case Phase.DEFENCE:
                this.processVillagerKill();
                this.resumeDay();
                break;
        }
    }

    startDay() {
        this.resetVotes();
        this.game.phase = Phase.DAY;
        this.game.save(); // send async update on db
        this.remainingTicksOfThisPhase = TICKS_PER_DAY;
        this.broadcast("PHASE_CHANGE", {
            phase: Phase.DAY
        })
    }

    startNight() {
        this.resetVotes();
        this.game.phase = Phase.NIGHT;
        this.game.save(); // send async update on db
        this.remainingTicksOfThisPhase = TICKS_PER_NIGHT;
        this.broadcast("PHASE_CHANGE", {
            phase: Phase.NIGHT
        })
    }

    resumeDay() {
        this.resetVotes();
        this.game.phase = Phase.DAY;
        this.game.save(); // send async update on db
        this.remainingTicksOfThisPhase = this.defenceStartingTick + EXTRA_TICKS_AFTER_DEFENCE;
        this.broadcast("PHASE_CHANGE", {
            phase: Phase.DAY
        })
    }

    resetVotes() {
        this.game.players.forEach(p => {
            p.votes = 0
        })
    }

    processWerewolfKill() {
        // TODO
    }

    processVillagerKill() {
        // TODO
    }

    // check if the game should continue (checked after nextPhase())
    canContinue() {
        // werewolves win if more or equals to half the players
        if (this.game.werewolfAlive >= Math.ceil(this.game.playersAlive / 2)) {
            this.processWerewolfWin();
            return false;
        }
        // villagers win if all werewolves are dead
        if (this.game.werewolfAlive === 0) {
            this.processVillagerWin();
            return false;
        }
        return true;
    }

    processWerewolfWin() {
        // TODO
    }

    processVillagerWin() {
        // TODO
    }
}

module.exports = TownOfSaviomGameEngine;