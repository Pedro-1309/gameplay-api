const GameEngine = require('../GameEngine');
const { gameModel } = require('../../models/gameModel');
const GameEvent = require('./GameEvent');
const Role = require('./Role');
const config = require('../../configurations/townOfSaviomRoles.json');
const { fisher_yates_shuffle } = require('./utils');
const { getChannelName } = require('../../socket/gameSocket');
const controller = require('../../controllers/gameController');
const Phase = require('./Phase');
const Status = require('./Status');
const VoteType = require('./VoteType');
const Result = require('./Result');
const TICKS_PER_DAY = 120;
const TICKS_PER_NIGHT = 60;
const TICKS_PER_DEFENCE = 30;
const TICKS_PER_STARTUP = 15;
const EXTRA_TICKS_AFTER_DEFENCE = 20;

class TownOfSaviomClassic extends GameEngine {
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
        // set ticks for startup
        this.remainingTicksOfThisPhase = TICKS_PER_STARTUP;
        this.game.phaseDuration = this.remainingTicksOfThisPhase;
        // save
        await this.game.save();
        this.log(this.game);
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

    isSpecialRole(playerId) {
        return this.isRole(playerId, Role.DOCTOR) || this.isRole(playerId, Role.SEER);
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
        const matchingPlayers = this.game.players.filter(
            p => p.userId === playerId
        );
        return matchingPlayers.length > 0 ?
            matchingPlayers[0] :
            undefined;
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
    handlePlayerJoin(socket, playerId, isAdmin) {
        // if the player ain't present in the game don't let him join anything
        if (!this.getPlayer(playerId)) {
            // a non playing admin can join and see everything
            if (isAdmin) {
                socket.join(this.gameId);
                socket.join(this.getWatchersChannel());
                socket.join(this.getWerewolfChannel());
            }
            return false;
        }
        // Private room for server communication to specific user
        socket.join(playerId);
        // Whole game room to interact during day
        socket.join(this.gameId);
        // right now watchers that weren't werewolves still can't see their messagges
        if (this.isWatching(playerId)) {
            socket.join(this.getWatchersChannel());
        }
        if (this.isWerewolf(playerId)) {
            socket.join(this.getWerewolfChannel());
        }
        return true;
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
            case GameEvent.GUILTY:
                this.handlePlayerGuilty(playerId);
                break;
            case GameEvent.INNOCENT:
                this.handlePlayerInnocent(playerId);
                break;
            case GameEvent.CANCEL_VOTE:
                this.handleCancelVote(playerId, null, null);
                break;
            default:
        };
    }

    handlePlayerMessage(playerId, message) {
        // if the player is watching send it only to watchers
        this.log(this.game)
        if (this.isWatching(playerId)) {
            this.broadcastPlayerMessageToChannel(
                playerId,
                message,
                this.getWatchersChannel()
            )
            return;
        }
        // send normal message if is day, startup or 
        // is the player being accused defending himself
        if (this.isDay() || this.isStartup() ||
            (this.isDefence() && this.isAccused(playerId))) {
            this.broadcastPlayerMessage(playerId, message);
            return;
        }
        // if it's night send werewolf messages to other werewolfes 
        if (this.isNight() && this.isWerewolf(playerId)) {
            this.broadcastPlayerMessageToChannel(
                playerId, 
                message, 
                this.getWerewolfChannel()
            );
            return;
        }
        // otherwise no message is sent
    }

    handlePlayerGuilty(playerId) {
        const votingPlayer = this.getPlayer(playerId);
        const votedPlayer = this.getPlayer(this.game.accused);
        if (this.isDefence() && this.isValidVote(votingPlayer, votedPlayer, this.game.accused)) {
            this.updateVote(votingPlayer, votedPlayer, VoteType.GUILTY);
            this.queueSave(); // send async update on db    
            this.broadcast("MESSAGE_SENT", `Player ${this.getName(playerId)} voted GUILTY`);
        }
    }

    handlePlayerInnocent(playerId) {
        const votingPlayer = this.getPlayer(playerId);
        const votedPlayer = this.getPlayer(this.game.accused);
        if (this.isDefence() && this.isValidVote(votingPlayer, votedPlayer, this.game.accused)) {
            this.updateVote(votingPlayer, votedPlayer, VoteType.INNOCENT);
            this.queueSave(); // send async update on db
            this.broadcast("MESSAGE_SENT", `Player ${this.getName(playerId)} voted INNOCENT`);  
        }
    }

    handlePlayerVote(playerId, votedPlayerId) {
        const votingPlayer = this.getPlayer(playerId);
        const votedPlayer = this.getPlayer(votedPlayerId);
        this.log(`Player ${votingPlayer} voted for player ${votedPlayer}`);
        // generic check for a valid vote
        // the voting player and the voted player must be playing
        // no self-voting allowed
        if (this.isValidVote(votingPlayer, votedPlayer, votedPlayerId)) {
            if (this.isDay()) {
                // if it's day we must check for majority to start defence phase
                this.updateVote(votingPlayer, votedPlayer, VoteType.ACTION);
                this.broadcast("MESSAGE_SENT", `Player ${this.getName(playerId)} voted for ${this.getName(votedPlayerId)}`);
                this.checkForDefenceStart(votedPlayer);
            } else if (this.isNight()) {
                if (this.isWerewolf(playerId) && !this.isWerewolf(votedPlayerId)) {
                    // if it's night and the voter is a werewolf he can vote only non-werewolves
                    // no other actions after the vote
                    this.updateVote(votingPlayer, votedPlayer, VoteType.ACTION);
                    this.broadcastToChannel(
                        this.getWerewolfChannel(),
                        "MESSAGE_SENT", 
                        `Werewolf ${this.getName(playerId)} voted to kill ${this.getName(votedPlayerId)}`
                    );
                } else if (this.isSpecialRole(playerId)) {
                    this.log("accepted special role vote");
                    // if it's night and the voter is a special role he can vote everyone (not himself, already checked)
                    // only he sees it
                    this.updateVote(votingPlayer, votedPlayer, VoteType.ACTION);
                    this.broadcastToChannel(
                        playerId,
                        "MESSAGE_SENT", 
                        `You voted ${this.getName(votedPlayerId)}`
                    );
                }
            }
        }
        this.queueSave(); // send async update on db
    }

    handleCancelVote(playerId) {
        this.updateVote(this.getPlayer(playerId), null, null);
        this.queueSave(); // send async update on db
        if (this.isDay() || this.isDefence()) {
            this.broadcast("MESSAGE_SENT", `Player ${this.getName(playerId)} cancelled their vote`);    
        }
        if (this.isNight() && this.isWerewolf(playerId)) {
            this.broadcastToChannel(
                this.getWerewolfChannel(),
                "MESSAGE_SENT", 
                `Werewolf ${this.getName(playerId)} cancelled their vote`
            );
        }
    }

    isValidVote(votingPlayer, votedPlayer, votedPlayerId) {
        // checks that voting is set and playing
        // checks that voted is undefined, or, if set, is playing
        // and that you ain't voting yourself
        return votingPlayer && votingPlayer.status === Status.PLAYING &&
            ((votedPlayer && votedPlayer.status === Status.PLAYING) || !votedPlayer) &&
            votingPlayer.userId !== votedPlayerId;
    }

    checkForDefenceStart(votedPlayer) {
        const majority = Math.ceil(this.game.playersAlive / 2);
        if (votedPlayer.votes >= majority) {
            this.log(`Player ${votedPlayer} has been accused by majority`);
            this.game.accused = votedPlayer.userId;
            this.queueSave(); // send async update on db
            this.defenceStartingTick = this.remainingTicksOfThisPhase;
            this.startDefence();
        }
    }

    updateVote(votingPlayer, votedPlayer, voteType) {
        // remove previous vote if any
        if (votingPlayer.voting) {
            const previousVotedPlayer = this.getPlayer(votingPlayer.voting);
            if (previousVotedPlayer) {
                previousVotedPlayer.votes -= 1;
                votingPlayer.voting = undefined;
                votingPlayer.vote = undefined;
            }
        }
        // add new vote
        if (votedPlayer) {
            votedPlayer.votes += 1;
            votingPlayer.voting = votedPlayer.userId;
            votingPlayer.vote = voteType;
        }
    }


    handlePlayerQuitting(playerId) {
        const quittingPlayer = this.getPlayer(playerId);    
        if (quittingPlayer && quittingPlayer.status === Status.PLAYING) {  
            quittingPlayer.status = Status.LEFT;
            this.queueSave(); // send async update on db
            this.broadcast("PLAYER_ELIMINATED", {
                userId: playerId,
                cause: 'QUIT'
            });
            this.log(`Player ${playerId} surrendered`);
        }
    }

    broadcastPlayerMessageToChannel(playerId, message, channel) {
        this.broadcastToChannel(
            channel,
            "MESSAGE_SENT", 
            `[${this.getName(playerId)}]: ${message}`   
        );
    }

    broadcastPlayerMessage(playerId, message) {
        this.broadcastPlayerMessageToChannel(playerId, message, this.gameId);
    }

    getWerewolfChannel() {
        return getChannelName(this.gameId, Role.WEREWOLF);
    }

    getWatchersChannel() {
        return getChannelName(this.gameId, Status.WATCHING);
    }

    // operations that must be done between each phase
    async nextPhase() {
        this.log(`End of phase ${this.game.phase}`);
        switch (this.game.phase) {
            // if day or startup end then start a new night
            case Phase.DAY:
            case Phase.STARTUP:
                this.startNight();
                break;
            // if night end process a werewolf kill then start a new day
            case Phase.NIGHT:
                this.processSpecialRolesActions();
                this.processWerewolfKill();
                this.startDay();
                break;
            // if defence end process the accused kill then resume the day
            case Phase.DEFENCE:
                const playerKilled = this.processVillagerKill();
                this.game.accused = undefined;
                if (playerKilled) {
                    this.startNight();
                } else {
                    this.resumeDay();
                }
                break;
        }
    }

    processSpecialRolesActions() {
        // Seer action
        this.game.players.filter(p => p.role === Role.SEER).forEach(p => {
            const investigatedPlayer = this.getPlayer(p.voting);
            this.log(`${p} investigated ${investigatedPlayer}`);
            if (investigatedPlayer) {
                this.broadcastToChannel(p.userId, 'MESSAGE_SENT', `${investigatedPlayer.name} is a ${investigatedPlayer.role}`);
                investigatedPlayer.votes -= 1;
            }
        })
        // Other roles
    }

    startDay() {
        this.log("Starting day phase");
        this.resetVotes();
        this.game.phase = Phase.DAY;
        this.remainingTicksOfThisPhase = TICKS_PER_DAY;
        this.game.phaseDuration = this.remainingTicksOfThisPhase;
        this.queueSave(); // send async update on db
        this.broadcast("PHASE_CHANGE", {
            phase: Phase.DAY,
            timeRemaining: this.remainingTicksOfThisPhase
        })
    }

    startNight() {
        this.log("Starting night phase");
        this.resetVotes();
        this.game.phase = Phase.NIGHT;
        this.remainingTicksOfThisPhase = TICKS_PER_NIGHT;
        this.game.phaseDuration = this.remainingTicksOfThisPhase;
        this.queueSave(); // send async update on db
        this.broadcast("PHASE_CHANGE", {
            phase: Phase.NIGHT,
            timeRemaining: this.remainingTicksOfThisPhase
        })
    }

    startDefence() {
        this.log("Starting defence phase");
        this.resetVotes();
        this.game.phase = Phase.DEFENCE;
        this.remainingTicksOfThisPhase = TICKS_PER_DEFENCE;
        this.game.phaseDuration = this.remainingTicksOfThisPhase;
        this.queueSave(); // send async update on db
        this.broadcast("PHASE_CHANGE", {
            phase: Phase.DEFENCE,
            timeRemaining: this.remainingTicksOfThisPhase,
            accused: this.game.accused
        })
    }

    resumeDay() {
        this.log("Resuming day phase");
        this.resetVotes();
        this.game.phase = Phase.DAY;
        this.remainingTicksOfThisPhase = this.defenceStartingTick + EXTRA_TICKS_AFTER_DEFENCE;
        this.game.phaseDuration = this.remainingTicksOfThisPhase;
        this.queueSave(); // send async update on db
        this.broadcast("PHASE_CHANGE", {
            phase: Phase.DAY,
            timeRemaining: this.remainingTicksOfThisPhase
        })
    }

    resetVotes() {
        this.game.players.forEach(p => {
            p.votes = 0;
            p.voting = undefined;
            p.vote = undefined;
        })
        this.deathDuringDay = false;
    }

    getMostVotedPlayer() {
        const maxVotes = Math.max(...this.game.players.map(p => p.votes));
        const playersWithMaxVotes = this.game.players.filter(p => p.votes === maxVotes);
        if (playersWithMaxVotes.length > 1) {
            // tie, no one is eliminated
            return undefined;
        }
        return playersWithMaxVotes[0];
    }

    getProtectedPlayers() {
        const playersProtected = this.game.players.filter(p => p.role === Role.DOCTOR).map(p => p.voting);
        if (playersProtected && playersProtected.length >= 1) {
            // subtract the vote for the werewolf kill decision
            this.game.players.filter(p => playersProtected.includes(p.userId)).forEach(p => {
                p.votes -= 1;
            })
            return playersProtected;
        }
        return undefined;
    }

    processWerewolfKill() {
        const protectedPlayers = this.getProtectedPlayers();
        const playerToKill = this.getMostVotedPlayer();
        if (playerToKill && (!protectedPlayers || !protectedPlayers.includes(playerToKill.userId))) {
            playerToKill.status = Status.WATCHING;
            this.queueSave(); // send async update on db
            this.broadcast("PLAYER_ELIMINATED", {
                userId: playerToKill.userId,
                cause: 'WEREWOLF_KILL'
            });
            this.log(`Player ${playerToKill.userId} eliminated by werewolves`);
            this.phasesWithNoKills = 0;
        } else {
            this.phasesWithNoKills += 1;
        }
    }

    processVillagerKill() {
        if (this.game.guiltyVotes > this.game.innocentVotes) {
            const playerToKill = this.getPlayer(this.game.accused);
            playerToKill.status = Status.WATCHING;
            this.queueSave(); // send async update on db
            this.broadcast("PLAYER_ELIMINATED", {
                userId: playerToKill.userId,
                cause: 'VILLAGER_KILL'
            });
            this.log(`Player ${playerToKill.userId} eliminated by villagers`);
            this.phasesWithNoKills = 0;
            return true;
        }
        return false;
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
        this.game.players.forEach(p => {
            if (this.isWerewolf(p.userId)) {
                p.result = Result.WON;
            } else {
                p.result = Result.LOST;
            }
            p.status = Status.LEFT;
        });
        this.game.phase = Phase.GAMEOVER;
        // send async update on db and then submit the result to stats-service
        this.queueSave().then(() => controller.submitGameStats(this.game));
        this.broadcast("GAMEOVER", this.game.players);
    }

    processVillagerWin() {
        this.game.players.forEach(p => {
            if (this.isWerewolf(p.userId)) {
                p.result = Result.LOST;
            } else {
                p.result = Result.WON;
            }
            p.status = Status.LEFT;
        });
        this.game.phase = Phase.GAMEOVER;
        // send async update on db and then submit the result to stats-service
        this.queueSave().then(() => controller.submitGameStats(this.game));
        this.broadcast("GAMEOVER", this.game.players);
    }
}

module.exports = TownOfSaviomClassic;