// public/js/live-listeners.js
import { showError, showSuccess } from './ui.js';

// Глобальные функции системы слушателей
window.toggleEarRegistration = function() {
    if (!window.currentUser || !window.socket) {
        showError('Сначала войдите в систему');
        return;
    }

    console.log('🔄 Toggling ear registration, current isEar:', window.isEar);
    
    try {
        if (window.isEar) {
            console.log('➖ Unregistering as listener...');
            window.socket.emit('unregister_listener', {
                userId: window.currentUser.id
            });
        } else {
            console.log('➕ Registering as listener...');
            window.socket.emit('register_listener', {
                userId: window.currentUser.id,
                userData: {
                    username: window.currentUser.username,
                    email: window.currentUser.email,
                    psychotype: 'empath'
                }
            });
        }
    } catch (error) {
        console.error('❌ Toggle error:', error);
        showError('Ошибка: ' + error.message);
    }
};

window.findLiveEar = async function() {
    try {
        const response = await fetch('/api/conversations/find', {
            method: 'POST',
            headers: {
                'Authorization': 'Bearer ' + window.currentToken
            }
        });
        const data = await response.json();
        if (response.ok) {
            window.currentConversationId = data.conversation_id;
            document.getElementById('conversationSection').classList.remove('hidden');
            showSuccess('Сессия начата!');
        } else {
            showError('Ошибка: ' + data.error);
        }
    } catch (error) {
        showError('Ошибка: ' + error.message);
    }
};

window.sendConversationMessage = async function() {
    const messageInput = document.getElementById('conversationMessageInput');
    const message = messageInput?.value.trim();
    if (!message) return;

    try {
        const response = await fetch(`/api/conversations/${window.currentConversationId}/message`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': 'Bearer ' + window.currentToken
            },
            body: JSON.stringify({ message })
        });
        if (response.ok) {
            messageInput.value = '';
            showSuccess('Сообщение отправлено!');
        } else {
            showError('Ошибка отправки сообщения');
        }
    } catch (error) {
        showError('Ошибка: ' + error.message);
    }
};

window.closeConversation = async function() {
    try {
        const response = await fetch(`/api/conversations/${window.currentConversationId}/close`, {
            method: 'POST',
            headers: {
                'Authorization': 'Bearer ' + window.currentToken
            }
        });
        if (response.ok) {
            window.currentConversationId = null;
            document.getElementById('conversationSection').classList.add('hidden');
            showSuccess('Сессия завершена');
        }
    } catch (error) {
        showError('Ошибка: ' + error.message);
    }
};

// Внутренние функции
export async function loadEarsInfo() {
    if (!window.currentToken) return;
    
    try {
        const response = await fetch('/api/ears/available', {
            headers: {
                'Authorization': 'Bearer ' + window.currentToken
            }
        });
        const data = await response.json();
        if (response.ok) {
            const earsInfo = document.getElementById('earsInfo');
            if (earsInfo) {
                earsInfo.innerHTML = `<div class="ear-status">Доступно слушателей: ${data.available_ears}</div>`;
            }
        }
    } catch (error) {
        console.error('Ошибка загрузки информации о слушателях:', error);
    }
}

// Socket event handlers для слушателей
export function setupSocketListeners() {
    if (!window.socket) return;

    window.socket.on('listener_registered', (data) => {
        window.isEar = true;
        const button = document.getElementById('earToggleButton');
        if (button) button.textContent = '🎧 Перестать быть слушателем';
        showSuccess('Вы теперь слушатель!');
    });

    window.socket.on('listener_unregistered', (data) => {
        console.log('✅ Listener unregistered:', data);
        window.isEar = false;
        const button = document.getElementById('earToggleButton');
        if (button) button.textContent = '🎧 Стать слушателем';
        showSuccess('Вы больше не слушатель');
    });
}