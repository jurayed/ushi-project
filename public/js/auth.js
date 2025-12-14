import { showTab, showMainInterface, showAuthInterface, showError, showSuccess } from './ui.js';
import { validateAuthFields, validateRegFields } from './utils.js';
import { initializeSocket } from './socket-client.js';

window.login = async function () {
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
            handleLoginSuccess(data);
        } else {
            showError(data.error || 'Ошибка входа');
        }
    } catch (error) {
        showError('Ошибка сети: ' + error.message);
    }
};

window.register = async function () {
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
            showSuccess('Регистрация успешна! Войдите.');
            showTab('login');
        } else {
            showError(data.error || 'Ошибка регистрации');
        }
    } catch (error) {
        showError('Ошибка сети: ' + error.message);
    }
};

window.logout = function () {
    window.currentUser = null;
    window.currentToken = null;
    window.isEar = false;
    window.currentConversationId = null;
    localStorage.removeItem('ushi_token');

    if (window.socket) {
        window.socket.disconnect();
        window.socket = null;
    }
    showAuthInterface();
};

function handleLoginSuccess(data) {
    window.currentToken = data.token;
    window.currentUser = data.user;
    localStorage.setItem('ushi_token', data.token);
    
    showMainInterface();
    showSuccess('Вход выполнен!');
    
    // Инициализация сокетов
    setTimeout(initializeSocket, 500);
}

// ЯВНО ДЕЛАЕМ ФУНКЦИИ ГЛОБАЛЬНЫМИ
window.login = login;
window.register = register;
window.logout = logout;
//console.log('✅ Auth module loaded');