import { setupSocketListeners } from './live-listeners.js';
import { setupWebRTCListeners } from './webrtc.js';

export async function initializeSocket() {
    if (!window.currentUser) return;

    console.log('🔌 Connecting socket...');
    
    // Подключение
    window.socket = io(); // Auto-detects host

    window.socket.on('connect', () => {
        console.log('✅ Connected');
        // Сообщаем серверу кто мы
        window.socket.emit('user_online', {
            userId: window.currentUser.id,
            userData: { username: window.currentUser.username }
        });
        
        // Подключаем обработчики
        setupSocketListeners();
        setupWebRTCListeners();
    });
}
