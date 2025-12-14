console.log('🚀 App Loaded');

// Глобальное состояние
window.currentUser = null;
window.currentToken = null;
window.socket = null;
window.isEar = false;
window.currentConversationId = null;

import { initializeSocket } from './socket-client.js';
import { showMainInterface } from './ui.js';

document.addEventListener('DOMContentLoaded', () => {
    const token = localStorage.getItem('ushi_token');
    if (token) {
        window.currentToken = token;
        checkAuth();
    }
});

async function checkAuth() {
    try {
        const res = await fetch('/api/profile', {
            headers: { 'Authorization': 'Bearer ' + window.currentToken }
        });
        if (res.ok) {
            window.currentUser = await res.json();
            showMainInterface();
            initializeSocket();
        } else {
            localStorage.removeItem('ushi_token');
        }
    } catch (e) {
        console.error(e);
    }
}
