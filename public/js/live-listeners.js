// public/js/live-listeners.js
import { showError, showSuccess } from './ui.js';

// Глобальные переменные для записи аудио
let conversationMediaRecorder = null;
let conversationAudioChunks = [];
let listenersRefreshInterval = null;

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
        console.log('🛑 Listeners auto-refresh stopped');
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
            // Не показываем ошибку каждый раз при авто-обновлении, только в консоль
            console.warn('Ошибка загрузки слушателей:', data.error);
        }
    } catch (error) {
        console.warn('Ошибка загрузки слушателей:', error.message);
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

    // Сохраняем текущий HTML чтобы проверить изменилось ли что-то (простая оптимизация)
    // Но для простоты пока просто перерисовываем

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

// --- Функции записи аудио ---

window.startConversationAudio = async function () {
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        showError('Ваш браузер не поддерживает запись аудио');
        return;
    }

    try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        conversationMediaRecorder = new MediaRecorder(stream);
        conversationAudioChunks = [];

        conversationMediaRecorder.ondataavailable = (event) => {
            conversationAudioChunks.push(event.data);
        };

        conversationMediaRecorder.onstop = () => {
            // Ничего не делаем здесь, отправка будет в sendConversationMessage
        };

        conversationMediaRecorder.start();

        // Обновляем UI
        document.getElementById('conversationRecordButton').style.display = 'none';
        document.getElementById('conversationStopButton').style.display = 'inline-block';
        document.getElementById('conversationCancelButton').style.display = 'inline-block';
        document.getElementById('conversationMessageInput').placeholder = 'Запись идет...';
        document.getElementById('conversationMessageInput').disabled = true;

    } catch (error) {
        console.error('Ошибка доступа к микрофону:', error);
        showError('Не удалось получить доступ к микрофону');
    }
};

window.stopConversationAudio = function () {
    if (conversationMediaRecorder && conversationMediaRecorder.state !== 'inactive') {
        conversationMediaRecorder.stop();
        conversationMediaRecorder.stream.getTracks().forEach(track => track.stop());

        // Обновляем UI
        document.getElementById('conversationRecordButton').style.display = 'inline-block';
        document.getElementById('conversationStopButton').style.display = 'none';
        document.getElementById('conversationCancelButton').style.display = 'none';
        document.getElementById('conversationMessageInput').placeholder = 'Голосовое сообщение записано. Нажмите отправить.';
        document.getElementById('conversationMessageInput').disabled = false;

        setTimeout(() => {
            sendConversationMessage(true); // true флаг что это аудио
        }, 500);
    }
};

window.cancelConversationAudio = function () {
    if (conversationMediaRecorder) {
        conversationMediaRecorder.stop();
        conversationMediaRecorder.stream.getTracks().forEach(track => track.stop());
    }
    conversationAudioChunks = [];
    conversationMediaRecorder = null;

    // Сброс UI
    document.getElementById('conversationRecordButton').style.display = 'inline-block';
    document.getElementById('conversationStopButton').style.display = 'none';
    document.getElementById('conversationCancelButton').style.display = 'none';
    document.getElementById('conversationMessageInput').placeholder = 'Сообщение...';
    document.getElementById('conversationMessageInput').disabled = false;
};

// --- Конец функций записи ---

window.sendConversationMessage = async function (isAudio = false) {
    const messageInput = document.getElementById('conversationMessageInput');
    let message = messageInput?.value.trim();
    let mediaUrl = null;
    let mediaType = null;

    // Если это аудио сообщение
    if (isAudio && conversationAudioChunks.length > 0) {
        const audioBlob = new Blob(conversationAudioChunks, { type: 'audio/webm' });
        const formData = new FormData();
        formData.append('audio', audioBlob, 'voice_message.webm');

        try {
            // Загружаем файл
            const uploadResponse = await fetch('/api/upload/audio', {
                method: 'POST',
                headers: {
                    'Authorization': 'Bearer ' + window.currentToken
                },
                body: formData
            });

            const uploadResult = await uploadResponse.json();
            if (uploadResponse.ok) {
                mediaUrl = uploadResult.url;
                mediaType = 'audio/webm';
                message = '[Голосовое сообщение]'; // Текст заглушка
            } else {
                showError('Ошибка загрузки аудио: ' + uploadResult.error);
                return;
            }
        } catch (error) {
            showError('Ошибка загрузки: ' + error.message);
            return;
        }

        // Очищаем чанки после успешной загрузки
        conversationAudioChunks = [];
        conversationMediaRecorder = null;

        // Возвращаем UI в исходное состояние
        document.getElementById('conversationMessageInput').placeholder = 'Сообщение...';
    } else {
        // Обычное текстовое сообщение
        if (!message) return;
    }

    try {
        const response = await fetch(`/api/conversations/${window.currentConversationId}/message`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': 'Bearer ' + window.currentToken
            },
            body: JSON.stringify({
                message,
                media_url: mediaUrl,
                media_type: mediaType
            })
        });

        const result = await response.json();

        if (response.ok) {
            messageInput.value = '';
            // Отображаем сообщение сразу
            appendMessage({
                sender_id: window.currentUser.id,
                message_text: message,
                media_url: mediaUrl,
                media_type: mediaType,
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

    // Если есть медиа (аудио)
    if (message.media_url && (message.media_type === 'audio/webm' || message.media_type === 'audio/mp3' || message.media_type === 'audio/wav')) {
        const audioPlayer = document.createElement('audio');
        audioPlayer.controls = true;
        audioPlayer.src = message.media_url;
        audioPlayer.style.marginTop = '5px';
        audioPlayer.style.width = '100%';
        msgDiv.appendChild(audioPlayer);
    }

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