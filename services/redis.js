// services/redis.js
const redis = require('redis');

class RedisService {
    constructor() {
        this.client = null;
        this.connected = false;
        this.storage = new Map(); // Mock storage
        this.init();
    }

    async init() {
        if (process.env.REDIS_HOST) {
            try {
                this.client = redis.createClient({
                    url: `redis://${process.env.REDIS_HOST}:${process.env.REDIS_PORT || 6379}`
                });
                this.client.on('error', (err) => console.error('Redis Error:', err.message));
                this.client.on('connect', () => { this.connected = true; console.log('✅ Redis connected'); });
                await this.client.connect();
                return;
            } catch (e) {
                console.warn('⚠️ Failed to connect to Redis, switching to Memory Mode');
            }
        }
        // Fallback to Memory Mode
        this.connected = true;
        console.log('⚠️ Using In-Memory Storage (Restarting server will clear online users)');
    }

    // --- User Management ---
    async setUserOnline(userId, socketId, userData = {}) {
        const data = { socketId, status: 'online', lastSeen: Date.now(), ...userData };
        if (this.client && this.client.isOpen) {
            await this.client.hSet(`user:${userId}`, toStringMap(data));
            await this.client.sAdd('online_users', userId.toString());
        } else {
            this.storage.set(`user:${userId}`, data);
            if (!this.storage.has('online_users')) this.storage.set('online_users', new Set());
            this.storage.get('online_users').add(userId.toString());
        }
    }

    async setUserOffline(userId) {
        if (this.client && this.client.isOpen) {
            await this.client.hSet(`user:${userId}`, 'status', 'offline');
            await this.client.sRem('online_users', userId.toString());
        } else {
            const user = this.storage.get(`user:${userId}`);
            if (user) user.status = 'offline';
            const online = this.storage.get('online_users');
            if (online) online.delete(userId.toString());
        }
    }

    async getUserSocket(userId) {
        if (this.client && this.client.isOpen) return await this.client.hGet(`user:${userId}`, 'socketId');
        return this.storage.get(`user:${userId}`)?.socketId;
    }

    // --- Listeners ---
    async addActiveListener(userId, data) {
        const strId = userId.toString();
        if (this.client && this.client.isOpen) {
            await this.client.sAdd('active_listeners', strId);
            await this.client.hSet(`listener:${strId}`, toStringMap(data));
        } else {
            if (!this.storage.has('active_listeners')) this.storage.set('active_listeners', new Set());
            this.storage.get('active_listeners').add(strId);
            this.storage.set(`listener:${strId}`, data);
        }
    }

    async removeActiveListener(userId) {
        const strId = userId.toString();
        if (this.client && this.client.isOpen) {
            await this.client.sRem('active_listeners', strId);
            await this.client.del(`listener:${strId}`);
        } else {
            const listeners = this.storage.get('active_listeners');
            if (listeners) listeners.delete(strId);
            this.storage.delete(`listener:${strId}`);
        }
    }

    async getAvailableListeners() {
        if (this.client && this.client.isOpen) {
            const ids = await this.client.sMembers('active_listeners');
            const list = [];
            for (const id of ids) {
                const data = await this.client.hGetAll(`listener:${id}`);
                list.push({ userId: id, ...data });
            }
            return list;
        } else {
            const ids = this.storage.get('active_listeners') || new Set();
            return Array.from(ids).map(id => ({ userId: id, ...this.storage.get(`listener:${id}`) }));
        }
    }

    // --- Stats ---
    async getStats() {
        if (this.client && this.client.isOpen) {
            return {
                online: await this.client.sCard('online_users'),
                listeners: await this.client.sCard('active_listeners')
            };
        } else {
            return {
                online: (this.storage.get('online_users') || new Set()).size,
                listeners: (this.storage.get('active_listeners') || new Set()).size
            };
        }
    }
}

// Helper to convert object values to strings for Redis HSET
function toStringMap(obj) {
    const res = {};
    for (const k in obj) res[k] = String(obj[k]);
    return res;
}

module.exports = new RedisService();
