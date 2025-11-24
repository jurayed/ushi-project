// public/js/ui.js
import { initializeSocket } from './socket-client.js';
import { loadEarsInfo } from './live-listeners.js';

export function showMainInterface() {
    document.getElementById('authSection').classList.add('hidden');
    
    const mainInterface = document.getElementById('mainInterface');
    if (mainInterface) {
        mainInterface.classList.remove('hidden');
        
        // Обновляем имя пользователя
        const userName = document.getElementById('userName');
        if (userName && window.currentUser) {
            userName.textContent = window.currentUser.username;
        }
    }
    
    // Инициализируем Socket.IO
    initializeSocket();
    
    // Загружаем информацию о слушателях
    loadEarsInfo();
    
    // Фокус на поле ввода сообщения
    setTimeout(() => {
        const messageInput = document.getElementById('messageInput');
        if (messageInput) messageInput.focus();
    }, 100);
}

export function showAuthInterface() {
    document.getElementById('authSection').classList.remove('hidden');
    document.getElementById('mainInterface').classList.add('hidden');
    
    // Очищаем поля
    const loginUsername = document.getElementById('loginUsername');
    const loginPassword = document.getElementById('loginPassword');
    if (loginUsername) loginUsername.value = '';
    if (loginPassword) loginPassword.value = '';
}

export function showTab(tabName) {
    document.querySelectorAll('.tab-button').forEach(btn => {
        btn.classList.remove('active');
    });
    
    event.target.classList.add('active');

    if (tabName === 'login') {
        document.getElementById('loginForm').classList.remove('hidden');
        document.getElementById('registerForm').classList.add('hidden');
    } else {
        document.getElementById('loginForm').classList.add('hidden');
        document.getElementById('registerForm').classList.remove('hidden');
    }
}

export function showError(message) {
    alert('❌ ' + message);
}

export function showSuccess(message) {
    alert('✅ ' + message);
}

export function showInfo(message) {
    alert('ℹ️ ' + message);
}

export function showLoading(message = 'Загрузка...') {
    console.log('Loading:', message);
}

export function hideLoading() {
    // Скрыть индикатор загрузки
}