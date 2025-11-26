// public/js/live-listeners.js
import { showError, showSuccess } from './ui.js';

// Глобальные функции системы слушателей
window.toggleEarRegistration = function () {
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

// Загрузить список доступных слушателей
window.loadAvailableListeners = async function () {
    try {
        const response = await fetch('/api/ears/list', {
            headers: {
                'Content-Type': 'application/json',
                'Authorization': 'Bearer ' + window.currentToken
            }
        });
        const data = await response.json();

        if (response.ok) {
            displayListenersList(data.listeners);
        } else {
            showError('Ошибка загрузки: ' + data.error);
        }
    } catch (error) {
        showError('Ошибка загрузки слушателей: ' + error.message);
    }
};

// Отобразить список слушателей
function displayListenersList(listeners) {
    const container = document.getElementById('listenersListContainer');
    if (!container) return;

    if (listeners.length === 0) {
        container.innerHTML = '<p style="text-align: center; color: #666;">Нет доступных слушателей</p>';
        return;
    }

    container.innerHTML = listeners.map(listener => `
        <div class="listener-card glass-panel">
            <div class="listener-info">
                <strong>👤 ${listener.username}</strong>
                <div style="font-size: 14px; color: var(--text-muted);">Онлайн • ${listener.psychotype}</div>
            </div>
            <button class="btn btn-primary" onclick="startConversationWith(${listener.id}, '${listener.username}')">
                Начать чат
            </button>
        </div>
    `).join('');
}

// Начать сессию с выбранным слушателем
window.startConversationWith = async function (listenerId, listenerName) {
    try {
        const response = await fetch('/api/conversations/create', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': 'Bearer ' + window.currentToken
            },
            body: JSON.stringify({ listenerId })
        });

        const data = await response.json();

        if (response.ok) {
            window.currentConversationId = data.conversation_id;
            window.currentPartnerName = listenerName;

            // Показать интерфейс чата
            document.getElementById('conversationSection').classList.remove('hidden');
            const partnerSpan = document.getElementById('conversationPartner');
            if (partnerSpan) partnerSpan.textContent = listenerName;

            showSuccess(`Сессия начата с ${listenerName}`);
            loadConversationMessages();
        } else {
            showError('Ошибка: ' + data.error);
        }
    } catch (error) {
        showError('Ошибка: ' + error.message);
    }
};

window.sendConversationMessage = async function () {
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

        const result = await response.json();

        if (response.ok) {
            messageInput.value = '';
            // Отображаем сообщение сразу
            appendMessage({
                sender_id: window.currentUser.id,
                message_text: message,
                sent_at: new Date().toISOString()
            }, true);
        } else {
            showError('Ошибка отправки сообщения');
        }
    } catch (error) {
        showError('Ошибка: ' + error.message);
    }
};

window.closeConversation = async function () {
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

// Вспомогательные функции для чата
function appendMessage(message, isOwn) {
    const container = document.getElementById('conversationMessages');
    if (!container) return;

    const msgDiv = document.createElement('div');
    msgDiv.className = `message ${isOwn ? 'user' : 'ai'}`;

    // Текст сообщения
    const textDiv = document.createElement('div');
    textDiv.textContent = message.message_text;
    msgDiv.appendChild(textDiv);

    // Время
    const timeDiv = document.createElement('div');
    timeDiv.className = 'message-time';
    timeDiv.style.fontSize = '0.7em';
    timeDiv.style.opacity = '0.7';
    timeDiv.style.marginTop = '4px';
    timeDiv.style.textAlign = 'right';

    const date = new Date(message.sent_at || Date.now());
    timeDiv.textContent = date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    msgDiv.appendChild(timeDiv);

    container.appendChild(msgDiv);
    container.scrollTop = container.scrollHeight;
}

async function loadConversationMessages() {
    if (!window.currentConversationId) return;

    const container = document.getElementById('conversationMessages');
    if (container) container.innerHTML = '';

    try {
        const response = await fetch(`/api/conversations/${window.currentConversationId}/messages`, {
            headers: { 'Authorization': 'Bearer ' + window.currentToken }
        });
        const messages = await response.json();
        if (response.ok && Array.isArray(messages)) {
            messages.forEach(msg => {
                appendMessage(msg, msg.sender_id === window.currentUser.id);
            });
        }
    } catch (error) {
        console.error('Error loading messages:', error);
    }
}

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

    // Обработчик входящего запроса на сессию (для слушателя)
    window.socket.on('new_conversation_request', (data) => {
        console.log('📩 New conversation request:', data);

        window.currentConversationId = data.conversation_id;
        window.currentPartnerName = data.requester.username;

        // Показать уведомление
        showSuccess(`Новый запрос от ${data.requester.username}`);

        // Открыть интерфейс чата
        document.getElementById('conversationSection').classList.remove('hidden');
        const partnerSpan = document.getElementById('conversationPartner');
        if (partnerSpan) partnerSpan.textContent = data.requester.username;

        loadConversationMessages();
    });

    // Обработка входящих сообщений
    window.socket.on('new_message', (message) => {
        console.log('📩 New message received:', message);
        if (window.currentConversationId && message.conversation_id == window.currentConversationId) {
            appendMessage(message, false);
        } else {
            // Можно добавить уведомление, если сообщение из другой (или новой) беседы
            showSuccess('Новое сообщение от собеседника');
        }
    });
}