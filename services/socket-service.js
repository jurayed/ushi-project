// services/socket-service.js
const RedisService = require('./redis');
// Подключаем модели, чтобы не писать SQL тут (разделение ответственности)
const { unregisterAsEar } = require('../models/conversations'); 

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
        // 1. Вход пользователя (Я онлайн)
        socket.on('user_online', async ({ userId, userData }) => {
            if (!userId) return;
            
            socket.userId = userId; // Привязываем ID к сокету
            await this.redis.setUserOnline(userId, socket.id, userData);
            
            console.log(`🟢 User ${userId} connected`);
            this.io.emit('user_status_changed', { userId, status: 'online' });
        });

        // 2. Регистрация слушателя (Только Redis часть, база уже обновлена через API)
        socket.on('register_listener', async ({ userId, userData }) => {
            if (!userId) return;
            // Просто обновляем статус в Redis
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

        // 5. 🔥 САМОЕ ВАЖНОЕ: Отключение (Disconnect)
        socket.on('disconnect', async () => {
            if (socket.userId) {
                console.log(`🔴 User ${socket.userId} disconnected`);
                
                // Убираем из онлайна
                await this.redis.setUserOffline(socket.userId);
                
                // Убираем из активных слушателей (в Redis), чтобы его не предлагало другим
                // Примечание: В БД ears мы его НЕ удаляем, он просто становится "оффлайн" в редисе
                await this.redis.removeActiveListener(socket.userId);
                
                this.io.emit('user_status_changed', { userId: socket.userId, status: 'offline' });
                this.broadcastListeners();
            }
        });
    }

    // Вспомогательная: обновить списки у всех
    async broadcastListeners() {
        const list = await this.redis.getAvailableListeners();
        this.io.emit('listeners_updated', list);
    }

    // WebRTC обработчики
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

    // Отправка конкретному юзеру
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
