const GameEngine = require('./GameEngine');

describe('GameEngine - Base Class', () => {
    let engine;
    let mockIo;

    beforeEach(() => {
        //Socket.io mock
        mockIo = {
            to: jest.fn().mockReturnThis(),
            emit: jest.fn()
        };
        
        engine = new GameEngine('room_123', mockIo);
        
        //Db object mock
        engine.game = { save: jest.fn().mockResolvedValue(true) };
        
        jest.useFakeTimers();
    });

    afterEach(() => {
        jest.useRealTimers();
    });

    test('broadcast() uses socket.io', () => {
        engine.broadcast('TEST_EVENT', { payload: 'data' });
        
        expect(mockIo.to).toHaveBeenCalledWith('room_123');
        expect(mockIo.emit).toHaveBeenCalledWith('TEST_EVENT', { payload: 'data' });
    });

    test('queueSave() must call the save method of the document', async () => {
        await engine.queueSave();
        expect(engine.game.save).toHaveBeenCalledTimes(1);
    });
});