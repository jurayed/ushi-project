// services/socket-service.js
const RedisService = require('./redis');
const { unregisterAsEar } = require('../models/conversations'); 

// 👇 1. ИМПОРТИРУЕМ НОВЫЙ СЕРВИС
const StreamService = require('./ai-stream'); 

class SocketService {
    constructor() {
        this.io = null;
        this.redis = RedisService;
    }

    initialize(server) {
        this.io = require('socket.io')(server, {
            cors: { origin: "*", methods: ["GET", "POST"] }
        });

        this.io.on('connection', (socket) => this.handleConnection(socket));
        console.log('✅ Socket.IO service started');
        return this.io;
    }

    handleConnection(socket) {
        // 👇 2. ПОДКЛЮЧАЕМ ОБРАБОТЧИК ГОЛОСА ЗДЕСЬ
        StreamService.handleStreamConnection(socket); 

        // 1. Вход пользователя
        socket.on('user_online', async ({ userId, userData }) => {
            if (!userId) return;
            socket.userId = userId; 
            await this.redis.setUserOnline(userId, socket.id, userData);
            console.log(`🟢 User ${userId} connected`);
            this.io.emit('user_status_changed', { userId, status: 'online' });
        });

        // 2. Регистрация слушателя
        socket.on('register_listener', async ({ userId, userData }) => {
            if (!userId) return;
            await this.redis.addActiveListener(userId, {
                ...userData,
                socketId: socket.id,
                available: true
            });
            this.broadcastListeners();
        });

        // 3. Отмена регистрации
        socket.on('unregister_listener', async ({ userId }) => {
            if (!userId) return;
            await this.redis.removeActiveListener(userId);
            this.broadcastListeners();
        });

        // 4. WebRTC звонки
        this.setupWebRTC(socket);

        // 5. Отключение
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
}

module.exports = new SocketService();
