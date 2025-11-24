// services/redis-schema.js
class RedisSchema {
    constructor(redisService) {
        this.redis = redisService;
    }

    // ==================== KEY PATTERNS ====================

    // Онлайн пользователи
    getUserOnlineKey(userId) {
        return `user:online:${userId}`;
    }

    getUserProfileKey(userId) {
        return `user:profile:${userId}`;
    }

    getListenerAvailableKey(userId) {
        return `listener:available:${userId}`;
    }

    getConversationKey(conversationId) {
        return `conversation:${conversationId}`;
    }

    // ==================== SETS ====================

    // Активные слушатели (Set)
    async addActiveListener(userId) {
        await this.redis.client.sAdd('active_listeners', userId.toString());
    }

    async removeActiveListener(userId) {
        await this.redis.client.sRem('active_listeners', userId.toString());
    }

    async getActiveListeners() {
        return await this.redis.client.sMembers('active_listeners');
    }

    async isActiveListener(userId) {
        return await this.redis.client.sIsMember('active_listeners', userId.toString());
    }

    // Активные разговоры (Set)
    async addActiveConversation(conversationId) {
        await this.redis.client.sAdd('active_conversations', conversationId);
    }

    async removeActiveConversation(conversationId) {
        await this.redis.client.sRem('active_conversations', conversationId);
    }

    async getActiveConversations() {
        return await this.redis.client.sMembers('active_conversations');
    }

    // ==================== HASHES ====================

    // Онлайн пользователи (Hash)
    async setUserOnline(userId, socketId, userData) {
        const onlineKey = 'users:online';
        const profileKey = this.getUserProfileKey(userId);
        
        await this.redis.client.hSet(onlineKey, userId.toString(), socketId);
        await this.redis.client.set(profileKey, JSON.stringify(userData));
        
        // TTL 1 день для профиля
        await this.redis.client.expire(profileKey, 86400);
    }

    async setUserOffline(userId) {
        const onlineKey = 'users:online';
        await this.redis.client.hDel(onlineKey, userId.toString());
        await this.removeActiveListener(userId);
        await this.redis.client.del(this.getListenerAvailableKey(userId));
    }

    async getUserSocket(userId) {
        return await this.redis.client.hGet('users:online', userId.toString());
    }

    async getUserProfile(userId) {
        const data = await this.redis.client.get(this.getUserProfileKey(userId.toString()));
        return data ? JSON.parse(data) : null;
    }

    // Доступные слушатели (Hash)
    async setListenerAvailable(userId, listenerData) {
        const listenerKey = this.getListenerAvailableKey(userId.toString());
        await this.redis.client.set(listenerKey, JSON.stringify(listenerData));
        await this.redis.client.expire(listenerKey, 3600); // 1 час TTL
    }

    async getListenerData(userId) {
        const data = await this.redis.client.get(this.getListenerAvailableKey(userId.toString()));
        return data ? JSON.parse(data) : null;
    }

    async removeListenerAvailable(userId) {
        await this.redis.client.del(this.getListenerAvailableKey(userId.toString()));
    }

    // ==================== SORTED SETS ====================

    // Рейтинги слушателей (Sorted Set)
    async setListenerRating(userId, rating) {
        await this.redis.client.zAdd('listeners:ratings', { score: rating, value: userId.toString() });
    }

    async getListenerRating(userId) {
        return await this.redis.client.zScore('listeners:ratings', userId.toString());
    }

    async getTopListeners(limit = 10) {
        return await this.redis.client.zRange('listeners:ratings', 0, limit - 1, { REV: true });
    }

    async incrementListenerRating(userId, increment = 1) {
        return await this.redis.client.zIncrBy('listeners:ratings', increment, userId.toString());
    }

    // ==================== COMPOSITE METHODS ====================

    async getAvailableListenersWithData() {
        const listenerIds = await this.getActiveListeners();
        const listeners = [];

        for (const userId of listenerIds) {
            const listenerData = await this.getListenerData(userId);
            if (listenerData) {
                const profile = await this.getUserProfile(userId);
                const rating = await this.getListenerRating(userId);
                
                listeners.push({
                    ...listenerData,
                    profile: profile,
                    rating: rating || 0
                });
            } else {
                // Удаляем если данные устарели
                await this.removeActiveListener(userId);
            }
        }

        return listeners;
    }

    async getUserFullData(userId) {
        const [profile, isListener, rating, socketId] = await Promise.all([
            this.getUserProfile(userId),
            this.isActiveListener(userId),
            this.getListenerRating(userId),
            this.getUserSocket(userId)
        ]);

        return {
            profile,
            isOnline: !!socketId,
            isListener: isListener,
            rating: rating || 0,
            socketId
        };
    }

    // ==================== STATISTICS ====================

    async getStats() {
        const [
            totalOnline,
            totalListeners,
            totalConversations,
            topListeners
        ] = await Promise.all([
            this.redis.client.hLen('users:online'),
            this.redis.client.sCard('active_listeners'),
            this.redis.client.sCard('active_conversations'),
            this.getTopListeners(5)
        ]);

        return {
            totalOnline,
            totalListeners,
            totalConversations,
            topListeners: await Promise.all(
                topListeners.map(async userId => ({
                    userId,
                    rating: await this.getListenerRating(userId),
                    profile: await this.getUserProfile(userId)
                }))
            )
        };
    }
}

module.exports = RedisSchema;