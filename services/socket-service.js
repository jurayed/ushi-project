const RedisService = require('./redis');
const { pool } = require('../models/database'); // Подключаем Postgres

class SocketService {
    constructor() {
        this.io = null;
        this.redis = RedisService;
    }

    initialize(server) {
        this.io = require('socket.io')(server, {
            cors: {
                origin: "*",
                methods: ["GET", "POST"]
            }
        });

        this.setupEventHandlers();
        console.log('✅ Socket.IO сервер инициализирован');
        return this.io;
    }

    setupEventHandlers() {
        this.io.on('connection', (socket) => {
            console.log('🔌 User connected:', socket.id);

            // User authentication and online status
            socket.on('user_online', async (data) => {
                try {
                    const { userId, userData } = data;
                    console.log('🟢 User online event:', { userId, userData });

                    // Проверяем существование пользователя в Postgres
                    const userResult = await pool.query(
                        'SELECT id, username, email FROM users WHERE id = $1',
                        [userId]
                    );

                    if (userResult.rows.length === 0) {
                        socket.emit('error', { message: 'Пользователь не найден в базе' });
                        return;
                    }

                    const user = userResult.rows[0];

                    await this.redis.setUserOnline(userId, socket.id, {
                        username: user.username,
                        email: user.email,
                        ...userData
                    });
                    socket.userId = userId;

                    console.log(`👤 User ${userId} is online`);
                    this.io.emit('user_status_changed', { userId, status: 'online' });
                } catch (error) {
                    console.error('❌ Ошибка user_online:', error);
                    socket.emit('error', { message: 'Ошибка установки онлайн статуса' });
                }
            });

            // Listener registration
            socket.on('register_listener', async (data) => {
                try {
                    console.log('🎧 Register listener event received:', data);

                    const { userId, userData } = data;

                    // ВАЖНО: Проверяем, что userId передан
                    if (!userId) {
                        console.error('❌ userId не передан в register_listener');
                        socket.emit('error', { message: 'ID пользователя не указан' });
                        return;
                    }

                    // Проверяем существование пользователя в Postgres
                    const userResult = await pool.query(
                        'SELECT id, username, email FROM users WHERE id = $1',
                        [userId]
                    );

                    if (userResult.rows.length === 0) {
                        console.error('❌ Пользователь не найден в базе:', userId);
                        socket.emit('error', { message: 'Пользователь не найден' });
                        return;
                    }

                    const user = userResult.rows[0];

                    // Сохраняем слушателя в Postgres (таблица ears)
                    const earResult = await pool.query(
                        `INSERT INTO ears (user_id, is_available, rating, sessions_completed) 
                         VALUES ($1, $2, $3, $4) 
                         ON CONFLICT (user_id) 
                         DO UPDATE SET is_available = $2, updated_at = CURRENT_TIMESTAMP
                         RETURNING *`,
                        [userId, true, 5.0, 0]
                    );

                    // Сохраняем в Redis для real-time доступа
                    await this.redis.addActiveListener(userId, {
                        userId: userId,
                        socketId: socket.id,
                        available: true,
                        rating: 5.0,
                        username: user.username,
                        userData: userData,
                        registeredAt: new Date().toISOString()
                    });

                    socket.emit('listener_registered', {
                        success: true,
                        listenerId: earResult.rows[0].id,
                        rating: 5.0
                    });

                    // Уведомляем всех о обновлении списка слушателей
                    const availableListeners = await this.redis.getAvailableListeners();
                    this.io.emit('listeners_updated', availableListeners);

                    console.log(`🎧 User ${userId} (${user.username}) зарегистрирован как слушатель`);
                } catch (error) {
                    console.error('❌ Ошибка register_listener:', error);
                    socket.emit('error', { message: `Ошибка регистрации слушателя: ${error.message}` });
                }

            });

            // Listener unregistration
            socket.on('unregister_listener', async (data) => {
                try {
                    console.log('➖ Unregister listener event received:', data);
                    const { userId } = data;

                    if (!userId) {
                        socket.emit('error', { message: 'ID пользователя не указан' });
                        return;
                    }

                    // Обновляем статус в Postgres
                    await pool.query(
                        'UPDATE ears SET is_available = false WHERE user_id = $1',
                        [userId]
                    );

                    // Удаляем из Redis
                    await this.redis.removeActiveListener(userId);

                    socket.emit('listener_unregistered', { success: true });

                    // Уведомляем всех
                    const availableListeners = await this.redis.getAvailableListeners();
                    this.io.emit('listeners_updated', availableListeners);

                    console.log(`🎧 User ${userId} перестал быть слушателем`);
                } catch (error) {
                    console.error('❌ Ошибка unregister_listener:', error);
                    socket.emit('error', { message: 'Ошибка отмены регистрации слушателя' });
                }
            });

            // WebRTC handlers
            socket.on('call_user', async (data) => {
                try {
                    console.log(`📞 Call initiated from ${socket.userId} to ${data.toUserId}`);
                    const success = await this.emitToUser(data.toUserId, 'incoming_call', {
                        fromUserId: socket.userId,
                        signal: data.signal,
                        withVideo: data.withVideo
                    });
                    if (!success) {
                        socket.emit('call_failed', { reason: 'User offline or not found' });
                    }
                } catch (error) {
                    console.error('Error in call_user:', error);
                }
            });

            socket.on('answer_call', async (data) => {
                try {
                    console.log(`📞 Call answered by ${socket.userId} to ${data.toUserId}`);
                    await this.emitToUser(data.toUserId, 'call_accepted', {
                        fromUserId: socket.userId,
                        signal: data.signal
                    });
                } catch (error) {
                    console.error('Error in answer_call:', error);
                }
            });

            socket.on('ice_candidate', async (data) => {
                try {
                    await this.emitToUser(data.toUserId, 'ice_candidate', {
                        fromUserId: socket.userId,
                        candidate: data.candidate
                    });
                } catch (error) {
                    console.error('Error in ice_candidate:', error);
                }
            });

            socket.on('reject_call', async (data) => {
                try {
                    console.log(`❌ Call rejected by ${socket.userId} from ${data.toUserId}`);
                    await this.emitToUser(data.toUserId, 'call_rejected', {
                        fromUserId: socket.userId
                    });
                } catch (error) {
                    console.error('Error in reject_call:', error);
                }
            });

            socket.on('end_call', async (data) => {
                try {
                    console.log(`📞 Call ended by ${socket.userId}`);
                    await this.emitToUser(data.toUserId, 'call_ended', {
                        fromUserId: socket.userId
                    });
                } catch (error) {
                    console.error('Error in end_call:', error);
                }
            });

        });
    }

    // Отправить сообщение конкретному пользователю
    async emitToUser(userId, event, data) {
        try {
            const socketId = await this.redis.getUserSocketId(userId);
            if (socketId) {
                this.io.to(socketId).emit(event, data);
                return true;
            }
            return false;
        } catch (error) {
            console.error('❌ Error emitting to user:', error);
            return false;
        }
    }

    // Уведомить слушателя о новой сессии
    async notifyNewConversation(listenerId, data) {
        return this.emitToUser(listenerId, 'new_conversation_request', data);
    }
}

module.exports = new SocketService();