const RedisService = require('./redis');

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
                    await this.redis.setUserOnline(userId, socket.id, userData);
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
                    const { userId, userData } = data;
                    await this.redis.addActiveListener(userId, {
                        ...userData,
                        socketId: socket.id,
                        available: true,
                        registeredAt: new Date()
                    });
                    
                    // Установим начальный рейтинг
                    await this.redis.setListenerRating(userId, 5.0);
                    
                    socket.emit('listener_registered', { success: true });
                    
                    // Уведомляем всех о обновлении списка слушателей
                    const availableListeners = await this.redis.getAvailableListeners();
                    this.io.emit('listeners_updated', availableListeners);
                    
                    console.log(`🎧 User ${userId} зарегистрирован как слушатель`);
                } catch (error) {
                    console.error('❌ Ошибка register_listener:', error);
                    socket.emit('error', { message: 'Ошибка регистрации слушателя' });
                }
            });

            // Listener unregistration
            socket.on('unregister_listener', async (data) => {
                try {
                    const { userId } = data;
                    await this.redis.removeActiveListener(userId);
                    
                    socket.emit('listener_unregistered', { success: true });
                    
                    // Уведомляем всех о обновлении списка слушателей
                    const availableListeners = await this.redis.getAvailableListeners();
                    this.io.emit('listeners_updated', availableListeners);
                    
                    console.log(`🎧 User ${userId} больше не слушатель`);
                } catch (error) {
                    console.error('❌ Ошибка unregister_listener:', error);
                    socket.emit('error', { message: 'Ошибка отмены регистрации слушателя' });
                }
            });

            // Find listener and create conversation
            socket.on('find_listener', async (data) => {
                try {
                    const { userId, userData } = data;
                    const availableListeners = await this.redis.getAvailableListeners();
                    
                    // Сортируем слушателей по рейтингу (лучшие первые)
                    const sortedListeners = availableListeners
                        .filter(l => l.userId !== userId && l.available)
                        .sort((a, b) => (b.rating || 0) - (a.rating || 0));
                    
                    if (sortedListeners.length > 0) {
                        const bestListener = sortedListeners[0];
                        const conversationId = `conv_${Date.now()}`;
                        const conversationData = {
                            id: conversationId,
                            userId: userId,
                            listenerId: bestListener.userId,
                            userData: userData,
                            listenerData: bestListener,
                            createdAt: new Date(),
                            messages: []
                        };

                        await this.redis.createConversation(conversationId, conversationData);
                        
                        // Помечаем слушателя как занятого
                        await this.redis.addActiveListener(bestListener.userId, {
                            ...bestListener,
                            available: false
                        });
                        
                        // Уведомляем пользователя
                        socket.emit('conversation_created', {
                            conversationId,
                            withUser: bestListener,
                            success: true
                        });

                        // Уведомляем слушателя
                        const listenerSocketId = await this.redis.getUserSocket(bestListener.userId);
                        if (listenerSocketId) {
                            this.io.to(listenerSocketId).emit('new_conversation', {
                                conversationId,
                                withUser: userData
                            });
                        }
                        
                        console.log(`💬 Создан разговор ${conversationId} между ${userId} и ${bestListener.userId}`);
                    } else {
                        socket.emit('no_listeners_available', {
                            success: false,
                            message: 'К сожалению, сейчас нет свободных слушателей'
                        });
                    }
                } catch (error) {
                    console.error('❌ Ошибка find_listener:', error);
                    socket.emit('error', { message: 'Ошибка поиска слушателя' });
                }
            });

            // Real-time messaging
            socket.on('send_message', async (data) => {
                try {
                    const { conversationId, message, senderId, senderName } = data;
                    const conversation = await this.redis.getConversation(conversationId);
                    
                    if (conversation) {
                        const newMessage = {
                            senderId,
                            senderName,
                            message,
                            timestamp: new Date()
                        };
                        
                        conversation.messages.push(newMessage);
                        await this.redis.createConversation(conversationId, conversation);
                        
                        // Определяем получателя
                        const receiverId = senderId === conversation.userId ? conversation.listenerId : conversation.userId;
                        const receiverSocketId = await this.redis.getUserSocket(receiverId);
                        
                        // Отправляем сообщение отправителю (для подтверждения)
                        socket.emit('message_sent', {
                            conversationId,
                            message: newMessage
                        });
                        
                        // Отправляем сообщение получателю
                        if (receiverSocketId) {
                            this.io.to(receiverSocketId).emit('new_message', {
                                conversationId,
                                message: newMessage
                            });
                        }
                        
                        console.log(`✉️ Сообщение в разговоре ${conversationId} от ${senderName}`);
                    } else {
                        socket.emit('error', { message: 'Разговор не найден' });
                    }
                } catch (error) {
                    console.error('❌ Ошибка send_message:', error);
                    socket.emit('error', { message: 'Ошибка отправки сообщения' });
                }
            });

            // End conversation
            socket.on('end_conversation', async (data) => {
                try {
                    const { conversationId, userId } = data;
                    const conversation = await this.redis.getConversation(conversationId);
                    
                    if (conversation) {
                        // Освобождаем слушателя
                        await this.redis.addActiveListener(conversation.listenerId, {
                            ...conversation.listenerData,
                            available: true
                        });
                        
                        // Удаляем разговор
                        await this.redis.endConversation(conversationId);
                        
                        // Уведомляем участников
                        const userSocketId = await this.redis.getUserSocket(conversation.userId);
                        const listenerSocketId = await this.redis.getUserSocket(conversation.listenerId);
                        
                        if (userSocketId) {
                            this.io.to(userSocketId).emit('conversation_ended', { conversationId });
                        }
                        if (listenerSocketId) {
                            this.io.to(listenerSocketId).emit('conversation_ended', { conversationId });
                        }
                        
                        console.log(`🔚 Разговор ${conversationId} завершен`);
                    }
                } catch (error) {
                    console.error('❌ Ошибка end_conversation:', error);
                    socket.emit('error', { message: 'Ошибка завершения разговора' });
                }
            });

            // Update listener availability
            socket.on('update_listener_availability', async (data) => {
                try {
                    const { userId, available } = data;
                    const listenerData = await this.redis.getListenerData(userId);
                    
                    if (listenerData) {
                        await this.redis.addActiveListener(userId, {
                            ...listenerData,
                            available: available
                        });
                        
                        // Уведомляем всех о обновлении списка слушателей
                        const availableListeners = await this.redis.getAvailableListeners();
                        this.io.emit('listeners_updated', availableListeners);
                        
                        socket.emit('availability_updated', { success: true, available });
                    }
                } catch (error) {
                    console.error('❌ Ошибка update_listener_availability:', error);
                    socket.emit('error', { message: 'Ошибка обновления доступности' });
                }
            });

            // Get conversation history
            socket.on('get_conversation', async (data) => {
                try {
                    const { conversationId } = data;
                    const conversation = await this.redis.getConversation(conversationId);
                    
                    if (conversation) {
                        socket.emit('conversation_data', {
                            conversationId,
                            conversation
                        });
                    } else {
                        socket.emit('error', { message: 'Разговор не найден' });
                    }
                } catch (error) {
                    console.error('❌ Ошибка get_conversation:', error);
                    socket.emit('error', { message: 'Ошибка получения разговора' });
                }
            });

            socket.on('disconnect', async () => {
                try {
                    if (socket.userId) {
                        await this.redis.setUserOffline(socket.userId);
                        this.io.emit('user_status_changed', { userId: socket.userId, status: 'offline' });
                        
                        // Уведомляем о обновлении списка слушателей
                        const availableListeners = await this.redis.getAvailableListeners();
                        this.io.emit('listeners_updated', availableListeners);
                    }
                    console.log('🔌 User disconnected:', socket.id);
                } catch (error) {
                    console.error('❌ Ошибка при disconnect:', error);
                }
            });
        });
    }

    // Вспомогательные методы
    async broadcastListenersUpdate() {
        try {
            const availableListeners = await this.redis.getAvailableListeners();
            this.io.emit('listeners_updated', availableListeners);
        } catch (error) {
            console.error('❌ Ошибка broadcastListenersUpdate:', error);
        }
    }
}

module.exports = new SocketService();