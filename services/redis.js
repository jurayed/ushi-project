// services/redis.js
const redis = require('redis');

class RedisService {
    constructor() {
        this.client = null;
        this.connected = false;
        this.init();
    }

    async init() {
        try {
            this.client = redis.createClient({
                socket: {
                    host: process.env.REDIS_HOST || 'localhost',
                    port: process.env.REDIS_PORT || 6379,
                    connectTimeout: 5000,
                    reconnectStrategy: (retries) => Math.min(retries * 100, 3000)
                }
            });

            this.client.on('error', (err) => {
                console.error('Redis error:', err);
                this.connected = false;
            });

            this.client.on('connect', () => {
                console.log('Redis connected');
                this.connected = true;
            });

            this.client.on('disconnect', () => {
                console.log('Redis disconnected');
                this.connected = false;
            });

            await this.client.connect();
            
        } catch (error) {
            console.error('Failed to connect to Redis:', error.message);
            this.initMock();
        }
    }

    initMock() {
        console.log('Using in-memory storage');
        this.connected = true;
        this.storage = new Map();
        
        // Mock client methods
        this.client = {
            get: async (key) => this.storage.get(key),
            set: async (key, value) => this.storage.set(key, value),
            del: async (key) => this.storage.delete(key),
            hSet: async (key, ...args) => {
                const hash = this.storage.get(key) || {};
                
                // Handle both object and field-value pairs
                if (args.length === 1 && typeof args[0] === 'object') {
                    Object.assign(hash, args[0]);
                } else {
                    for (let i = 0; i < args.length; i += 2) {
                        hash[args[i]] = args[i + 1];
                    }
                }
                
                this.storage.set(key, hash);
                return Object.keys(hash).length;
            },
            hGet: async (key, field) => {
                const hash = this.storage.get(key) || {};
                return hash[field];
            },
            hGetAll: async (key) => this.storage.get(key) || {},
            sAdd: async (key, member) => {
                const set = this.storage.get(key) || new Set();
                set.add(member);
                this.storage.set(key, set);
                return 1;
            },
            sRem: async (key, member) => {
                const set = this.storage.get(key);
                if (set) {
                    const hadMember = set.has(member);
                    set.delete(member);
                    return hadMember ? 1 : 0;
                }
                return 0;
            },
            sMembers: async (key) => Array.from(this.storage.get(key) || []),
            zAdd: async (key, score, member) => {
                const sortedSet = this.storage.get(key) || new Map();
                sortedSet.set(member, score);
                this.storage.set(key, sortedSet);
                return 1;
            },
            zRange: async (key, start, stop) => {
                const sortedSet = this.storage.get(key);
                if (!sortedSet) return [];
                
                return Array.from(sortedSet.entries())
                    .sort(([,a], [,b]) => a - b)
                    .slice(start, stop + 1)
                    .map(([member]) => member);
            },
            exists: async (key) => this.storage.has(key) ? 1 : 0
        };
    }

    // User management
    async setUserOnline(userId, socketId, userData = {}) {
        const timestamp = Date.now().toString();
        
        await this.client.hSet(`user:${userId}`, 
            'socketId', socketId,
            'status', 'online',
            'lastSeen', timestamp,
            ...Object.entries(userData).flatMap(([key, value]) => [key, value.toString()])
        );
        
        await this.client.sAdd('online_users', userId.toString());
    }

    async setUserOffline(userId) {
        const timestamp = Date.now().toString();
        
        await this.client.hSet(`user:${userId}`, 
            'status', 'offline',
            'lastSeen', timestamp
        );
        
        await this.client.sRem('online_users', userId.toString());
    }

    async getUser(userId) {
        const data = await this.client.hGetAll(`user:${userId}`);
        return data;
    }

    async getUserSocket(userId) {
        return await this.client.hGet(`user:${userId}`, 'socketId');
    }

    // Listener management
    async addActiveListener(userId, listenerData = {}) {
        await this.client.sAdd('active_listeners', userId.toString());
        
        const timestamp = Date.now().toString();
        const args = ['available', 'true', 'lastActive', timestamp];
        
        for (const [key, value] of Object.entries(listenerData)) {
            args.push(key, value.toString());
        }
        
        await this.client.hSet(`listener:${userId}`, ...args);
    }

    async removeActiveListener(userId) {
        await this.client.sRem('active_listeners', userId.toString());
        await this.client.del(`listener:${userId}`);
    }

    async setListenerAvailable(userId, available = true) {
        const timestamp = Date.now().toString();
        await this.client.hSet(`listener:${userId}`, 
            'available', available.toString(),
            'lastActive', timestamp
        );
    }

    async getAvailableListeners() {
        const listenerIds = await this.client.sMembers('active_listeners');
        const listeners = [];
        
        for (const listenerId of listenerIds) {
            const listener = await this.client.hGetAll(`listener:${listenerId}`);
            if (listener.available === 'true') {
                listeners.push({
                    userId: listenerId,
                    ...listener
                });
            }
        }
        
        return listeners;
    }

    // Conversation management
    async createConversation(conversationId, conversationData = {}) {
        await this.client.sAdd('active_conversations', conversationId.toString());
        await this.client.set(
            `conversation:${conversationId}`,
            JSON.stringify({
                ...conversationData,
                createdAt: Date.now(),
                status: 'active'
            })
        );
    }

    async getConversation(conversationId) {
        const data = await this.client.get(`conversation:${conversationId}`);
        return data ? JSON.parse(data) : null;
    }

    async endConversation(conversationId) {
        await this.client.sRem('active_conversations', conversationId.toString());
        await this.client.del(`conversation:${conversationId}`);
    }

    // Rating system
    async setListenerRating(userId, rating) {
        await this.client.hSet(`listener:${userId}`, 'rating', rating.toString());
    }

    async getListenerRating(userId) {
        const rating = await this.client.hGet(`listener:${userId}`, 'rating');
        return rating ? parseFloat(rating) : 0;
    }

    async incrementListenerRating(userId, increment = 1) {
        const current = await this.getListenerRating(userId);
        await this.setListenerRating(userId, current + increment);
    }

    // Statistics
    async getStats() {
        const [
            onlineUsers,
            activeListeners,
            activeConversations
        ] = await Promise.all([
            this.client.sMembers('online_users'),
            this.client.sMembers('active_listeners'),
            this.client.sMembers('active_conversations')
        ]);

        return {
            onlineUsers: onlineUsers.length,
            activeListeners: activeListeners.length,
            activeConversations: activeConversations.length
        };
    }

    // Health check
    isConnected() {
        return this.connected;
    }

    // Cleanup
    async disconnect() {
        if (this.client && this.client.quit) {
            await this.client.quit();
        }
    }
}

module.exports = new RedisService();