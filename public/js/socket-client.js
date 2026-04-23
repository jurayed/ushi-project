import { setupSocketListeners } from './live-listeners.js';
import { setupWebRTCListeners } from './webrtc.js';
import { setupRoomSocketListeners } from './rooms.js';

export async function initializeSocket() {
    if (!window.currentUser) return;

    console.log('🔌 Connecting socket...');

    window.socket = io();

    window.socket.on('connect', () => {
        console.log('✅ Socket connected');
        window.socket.emit('user_online', {
            userId: window.currentUser.id,
            userData: { username: window.currentUser.username }
        });

        setupSocketListeners();
        setupWebRTCListeners();
        setupRoomSocketListeners();
    });

    window.socket.on('disconnect', () => {
        console.log('🔌 Socket disconnected');
    });
}
