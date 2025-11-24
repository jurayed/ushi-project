// public/js/app.js - ТОЛЬКО ИНИЦИАЛИЗАЦИЯ
console.log('🚀 app.js загружен');

// Глобальные переменные
window.currentUser = null;
window.currentToken = null;
window.socket = null;
window.isEar = false;
window.currentConversationId = null;

// Инициализация при загрузке страницы
document.addEventListener('DOMContentLoaded', function() {
    console.log('✅ DOM загружен, приложение инициализировано');
    
    // Проверяем сохраненный токен при загрузке
    const savedToken = localStorage.getItem('ushi_token');
    if (savedToken) {
        window.currentToken = savedToken;
        checkAuth();
    }
});

// Проверка аутентификации при загрузке
async function checkAuth() {
    try {
        const response = await fetch('/api/profile', {
            headers: {
                'Authorization': 'Bearer ' + window.currentToken
            }
        });

        if (response.ok) {
            window.currentUser = await response.json();
            window.showMainInterface();
        } else {
            localStorage.removeItem('ushi_token');
            window.currentToken = null;
        }
    } catch (error) {
        console.error('Ошибка проверки авторизации:', error);
    }
}