// services/socket-service.js
const RedisService = require('./redis');
const StreamService = require('./ai-stream');
const Rooms = require('../models/rooms');

class SocketService {
    constructor() {
        this.io = null;
        this.redis = RedisService;
    }

    initialize(server) {
        this.io = require('socket.io')(server, {
            cors: { origin: '*', methods: ['GET', 'POST'] },
            maxHttpBufferSize: 10 * 1024 * 1024 // 10MB (для аудиочанков live-голоса)
        });

        this.io.on('connection', (socket) => this.handleConnection(socket));
        console.log('✅ Socket.IO service started');
        return this.io;
    }

    handleConnection(socket) {
        // Live voice
        StreamService.handleStreamConnection(socket);

        // Онлайн
        socket.on('user_online', async ({ userId, userData }) => {
            if (!userId) return;
            socket.userId = userId;
            await this.redis.setUserOnline(userId, socket.id, userData);
            console.log(`🟢 User ${userId} connected`);
            this.io.emit('user_status_changed', { userId, status: 'online' });
        });

        // Слушатели
        socket.on('register_listener', async ({ userId, userData }) => {
            if (!userId) return;
            await this.redis.addActiveListener(userId, {
                ...userData,
                socketId: socket.id,
                available: true
            });
            socket.emit('listener_registered');
            this.broadcastListeners();
        });

        socket.on('unregister_listener', async ({ userId }) => {
            if (!userId) return;
            await this.redis.removeActiveListener(userId);
            socket.emit('listener_unregistered');
            this.broadcastListeners();
        });

        // Групповые комнаты — подписка/отписка на socket.io room
        socket.on('join_room_channel', async ({ roomId }) => {
            if (!roomId || !socket.userId) return;
            const member = await Rooms.isMember(roomId, socket.userId);
            if (!member) return;
            socket.join(`room:${roomId}`);
        });

        socket.on('leave_room_channel', ({ roomId }) => {
            if (!roomId) return;
            socket.leave(`room:${roomId}`);
        });

        // WebRTC звонки
        this.setupWebRTC(socket);

        // Отключение
        socket.on('disconnect', async () => {
            if (socket.userId) {
                console.log(`🔴 User ${socket.userId} disconnected`);
                await this.redis.setUserOffline(socket.userId);
                await this.redis.removeActiveListener(socket.userId);
                this.io.emit('user_status_changed', { userId: socket.userId, status: 'offline' });
                this.broadcastListeners();
            }
        });
    }

    async broadcastListeners() {
        const list = await this.redis.getAvailableListeners();
        this.io.emit('listeners_updated', list);
    }

    setupWebRTC(socket) {
        const forward = (event, targetKey) => {
            socket.on(event, (data) => {
                const targetId = data[targetKey];
                this.emitToUser(targetId, event, { ...data, fromUserId: socket.userId });
            });
        };
        forward('call_user', 'toUserId');
        forward('answer_call', 'toUserId');
        forward('ice_candidate', 'toUserId');
        forward('reject_call', 'toUserId');
        forward('end_call', 'toUserId');
    }

    async emitToUser(userId, event, data) {
        const socketId = await this.redis.getUserSocket(userId);
        if (socketId) {
            this.io.to(socketId).emit(event, data);
            return true;
        }
        return false;
    }

    async notifyNewConversation(listenerUserId, data) {
        return this.emitToUser(listenerUserId, 'new_conversation_request', data);
    }

    // Рассылка события всем в socket.io-комнате `room:<id>`
    notifyRoomEvent(roomId, event, data) {
        if (!this.io) return;
        this.io.to(`room:${roomId}`).emit(event, data);
    }
}

module.exports = new SocketService();
