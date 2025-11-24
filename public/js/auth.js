// public/js/auth.js
import { showTab, showMainInterface, showAuthInterface, showError, showSuccess } from './ui.js';
import { validateAuthFields, validateRegFields } from './utils.js';

// Глобальные функции аутентификации
window.login = async function() {
    console.log('login вызван');
    const username = document.getElementById('loginUsername').value.trim();
    const password = document.getElementById('loginPassword').value;

    if (!validateAuthFields(username, password)) return;

    try {
        const response = await fetch('/api/login', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username, password })
        });

        const data = await response.json();

        if (response.ok) {
            window.currentToken = data.token;
            window.currentUser = data.user;
            localStorage.setItem('ushi_token', data.token);
            showMainInterface();
            showSuccess('Вход выполнен успешно!');
        } else {
            showError('Ошибка входа: ' + (data.error || 'Неизвестная ошибка'));
        }
    } catch (error) {
        showError('Ошибка сети: ' + error.message);
    }
};

window.register = async function() {
    console.log('register вызван');
    const username = document.getElementById('regUsername').value.trim();
    const email = document.getElementById('regEmail').value.trim();
    const password = document.getElementById('regPassword').value;

    if (!validateRegFields(username, email, password)) return;

    try {
        const response = await fetch('/api/register', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username, email, password })
        });

        const data = await response.json();

        if (response.ok) {
            showSuccess('Регистрация успешна! Теперь войдите в систему.');
            showTab('login');
            
            // Очищаем поля регистрации
            document.getElementById('regUsername').value = '';
            document.getElementById('regEmail').value = '';
            document.getElementById('regPassword').value = '';
        } else {
            showError('Ошибка регистрации: ' + (data.error || 'Неизвестная ошибка'));
        }
    } catch (error) {
        showError('Ошибка сети: ' + error.message);
    }
};

window.logout = function() {
    console.log('logout вызван');
    
    window.currentUser = null;
    window.currentToken = null;
    window.isEar = false;
    window.currentConversationId = null;
    
    localStorage.removeItem('ushi_token');
    
    // Отключаем Socket.IO если подключен
    if (window.socket) {
        window.socket.disconnect();
        window.socket = null;
    }
    
    showAuthInterface();
    
    console.log('✅ Выход выполнен');
};

window.showTab = showTab;