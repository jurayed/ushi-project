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

            // Listener registration - ИСПРАВЛЕННАЯ ВЕРСИЯ
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
        });
    }
}

module.exports = new SocketService();