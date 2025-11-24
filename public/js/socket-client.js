// public/js/socket-client.js
import { setupSocketListeners, loadEarsInfo } from './live-listeners.js';

export async function initializeSocket() {
    if (!window.currentUser) {
        console.log('⏳ Socket: Ожидаем аутентификацию пользователя');
        return;
    }

    console.log('🔌 Инициализация Socket.IO...');
    
    try {
        window.socket = io();

        window.socket.on('connect', () => {
            console.log('✅ Socket.IO подключен');
            
            window.socket.emit('user_online', {
                userId: window.currentUser.id,
                userData: {
                    username: window.currentUser.username,
                    email: window.currentUser.email
                }
            });

            // Загружаем информацию о слушателях после подключения
            loadEarsInfo();
        });

        window.socket.on('disconnect', () => {
            console.log('🔌 Socket.IO отключен');
        });

        window.socket.on('error', (error) => {
            console.error('❌ Socket error:', error);
        });

        setupSocketListeners();
        
        console.log('✅ Socket.IO инициализирован');
        
    } catch (error) {
        console.error('❌ Ошибка инициализации Socket.IO:', error);
    }
}