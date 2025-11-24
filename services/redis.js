// services/redis.js
const redis = require('redis');
const RedisSchema = require('./redis-schema');

class RedisService {
    constructor() {
        this.client = null;
        this.schema = null;
        this.connect();
    }

    async connect() {
        try {
            this.client = redis.createClient({
                socket: {
                    host: 'localhost',
                    port: 6379,
                    connectTimeout: 5000
                }
            });

            this.client.on('error', (err) => {
                console.error('❌ Redis error:', err);
            });

            this.client.on('connect', () => {
                console.log('✅ Redis connected successfully!');
                this.schema = new RedisSchema(this);
            });

            await this.client.connect();
            console.log('🎉 Redis готов к работе!');
            
        } catch (error) {
            console.error('❌ Не удалось подключиться к Redis:', error.message);
            console.log('🔄 Используем Redis Mock...');
            // Здесь можно переключиться на Mock если нужно
            const RedisMock = require('./redis-mock');
            this.client = new RedisMock();
            this.schema = new RedisSchema(this);
        }
    }

    // Все остальные методы остаются без изменений
    async setUserOnline(userId, socketId, userData) {
        return this.schema.setUserOnline(userId, socketId, userData);
    }

    async setUserOffline(userId) {
        return this.schema.setUserOffline(userId);
    }

    async getUserSocket(userId) {
        return this.schema.getUserSocket(userId);
    }

    async addActiveListener(userId, listenerData) {
        await this.schema.addActiveListener(userId);
        return this.schema.setListenerAvailable(userId, listenerData);
    }

    async removeActiveListener(userId) {
        await this.schema.removeActiveListener(userId);
        return this.schema.removeListenerAvailable(userId);
    }

    async getAvailableListeners() {
        return this.schema.getAvailableListenersWithData();
    }

    async createConversation(conversationId, conversationData) {
        await this.schema.addActiveConversation(conversationId);
        return this.client.set(
            `conversation:${conversationId}`,
            JSON.stringify(conversationData)
        );
    }

    async getConversation(conversationId) {
        const data = await this.client.get(`conversation:${conversationId}`);
        return data ? JSON.parse(data) : null;
    }

    async endConversation(conversationId) {
        await this.schema.removeActiveConversation(conversationId);
        return this.client.del(`conversation:${conversationId}`);
    }

    async setListenerRating(userId, rating) {
        return this.schema.setListenerRating(userId, rating);
    }

    async getListenerRating(userId) {
        return this.schema.getListenerRating(userId);
    }

    async incrementListenerRating(userId, increment = 1) {
        return this.schema.incrementListenerRating(userId, increment);
    }

    async getStats() {
        return this.schema.getStats();
    }
}

module.exports = new RedisService();