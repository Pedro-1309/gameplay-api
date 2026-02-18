const TownOfSaviomClassic = require('./TownOfSaviomClassic');
const Role = require('./Role');
const Phase = require('./Phase');
const Status = require('./Status');
const VoteType = require('./VoteType');
const Result = require('./Result');

// Mock dependencies
jest.mock('../../controllers/gameController', () => ({
    submitGameStats: jest.fn().mockResolvedValue(true),
    deleteRoom: jest.fn().mockResolvedValue(true)
}));

describe('TownOfSaviomClassic', () => {
    let engine;
    let mockIo;

    beforeEach(() => {
        // Mock Socket.io
        mockIo = {
            to: jest.fn().mockReturnThis(),
            in: jest.fn().mockReturnThis(),
            emit: jest.fn(),
            socketsJoin: jest.fn()
        };

        engine = new TownOfSaviomClassic('room_123', mockIo);
        
        engine.queueSave = jest.fn().mockResolvedValue(true);
        engine.broadcast = jest.fn(); // Mock broadcast to prevent socket errors
        engine.broadcastToChannel = jest.fn();

        engine.game = {
            phase: Phase.DAY,
            playersAlive: 4,
            werewolfAlive: 1,
            phaseTimeLeft: 30,
            accused: undefined,
            players: [
                { userId: 'p1', name: 'Alice', role: Role.VILLAGER, status: Status.PLAYING, votes: 0 },
                { userId: 'p2', name: 'Bob', role: Role.WEREWOLF, status: Status.PLAYING, votes: 0 },
                { userId: 'p3', name: 'Charlie', role: Role.DOCTOR, status: Status.PLAYING, votes: 0 },
                { userId: 'p4', name: 'Dave', role: Role.VILLAGER, status: Status.PLAYING, votes: 0 }
            ]
        };
    });

    describe('Roles and Status', () => {
        test('identify a werewolf', () => {
            expect(engine.isWerewolf('p2')).toBe(true);
            expect(engine.isWerewolf('p1')).toBe(false);
        });

        test('identify special roles', () => {
            expect(engine.isSpecialRole('p3')).toBe(true); // Doctor
            expect(engine.isSpecialRole('p1')).toBe(false); // Villager
        });

        test('fetch a player by ID', () => {
            const player = engine.getPlayer('p1');
            expect(player.name).toBe('Alice');
            expect(player.status).toBe(Status.PLAYING);
            expect(engine.getPlayer('invalid_id')).toBeUndefined();
        });
    });

    describe('Phase Management', () => {
        test('start the day phase', () => {
            engine.startDay();
            expect(engine.game.phase).toBe(Phase.DAY);
            expect(engine.game.phaseTimeLeft).toBe(120); // TICKS_PER_DAY
            expect(engine.broadcast).toHaveBeenCalledWith("PHASE_CHANGE", expect.any(Object));
            expect(engine.queueSave).toHaveBeenCalled();
        });

        test('start the night phase', () => {
            engine.startNight();
            expect(engine.game.phase).toBe(Phase.NIGHT);
            expect(engine.game.phaseTimeLeft).toBe(60); // TICKS_PER_NIGHT
        });

        test('reset all votes when changing phase', () => {
            engine.game.players[0].votes = 2;
            engine.game.players[0].voting = 'p2';
            
            engine.resetVotes();
            
            expect(engine.game.players[0].votes).toBe(0);
            expect(engine.game.players[0].voting).toBeUndefined();
        });
    });

    describe('Voting Logic', () => {
        test('validate a correct vote', () => {
            const voter = engine.getPlayer('p1');
            const target = engine.getPlayer('p2');
            
            const isValid = engine.isValidVote(voter, target, 'p2');
            expect(isValid).toBe(true);
        });

        test('invalidate a self-vote', () => {
            const voter = engine.getPlayer('p1');
            
            const isValid = engine.isValidVote(voter, voter, 'p1');
            expect(isValid).toBe(false);
        });

        test('update votes and remove previous ones', () => {
            const voter = engine.getPlayer('p1');
            const target1 = engine.getPlayer('p2');
            const target2 = engine.getPlayer('p3');

            engine.updateVote(voter, target1, VoteType.ACTION);
            expect(target1.votes).toBe(1);
            expect(voter.voting).toBe('p2');

            // Change vote
            engine.updateVote(voter, target2, VoteType.ACTION);
            expect(target1.votes).toBe(0);
            expect(target2.votes).toBe(1);
            expect(voter.voting).toBe('p3');
        });

        test('defence phase if majority is reached', () => {
            engine.startDefence = jest.fn();
            const target = engine.getPlayer('p2');
            target.votes = 3; // Majority out of 4 players
            
            engine.checkForDefenceStart(target);
            
            expect(engine.game.accused).toBe('p2');
            expect(engine.startDefence).toHaveBeenCalled();
        });
    });

    describe('Win Conditions (canContinue)', () => {
        beforeEach(() => {
            engine.processWerewolfWin = jest.fn();
            engine.processVillagerWin = jest.fn();
        });

        test('continue the game if no win condition is met', () => {
            expect(engine.canContinue()).toBe(true);
            expect(engine.processWerewolfWin).not.toHaveBeenCalled();
            expect(engine.processVillagerWin).not.toHaveBeenCalled();
        });

        test('trigger werewolf win if they are half or more of the alive players', () => {
            engine.game.playersAlive = 2;
            engine.game.werewolfAlive = 1;
            
            expect(engine.canContinue()).toBe(false);
            expect(engine.processWerewolfWin).toHaveBeenCalled();
        });

        test('trigger villager win if all werewolves are dead', () => {
            engine.game.werewolfAlive = 0;
            
            expect(engine.canContinue()).toBe(false);
            expect(engine.processVillagerWin).toHaveBeenCalled();
        });
    });

    describe('Game Timer', () => {
        beforeEach(() => {
            jest.useFakeTimers();
        });

        afterEach(() => {
            jest.useRealTimers();
        });

        test('start() emits SYNC_TIME every second', async () => {
            // "Fake" methods for start() to work
            engine.nextPhase = jest.fn();
            engine.canContinue = jest.fn().mockReturnValue(true);

            engine.start();
            jest.advanceTimersByTime(1000);

            // Timer needs to be at 29s and to emit the event
            expect(engine.game.phaseTimeLeft).toBe(29);
            expect(engine.broadcast).toHaveBeenCalledWith('SYNC_TIME', { time: 29 });
        });
    });
});