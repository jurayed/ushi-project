import { showError, showSuccess } from './ui.js';

// Глобальные переменные
let conversationMediaRecorder = null;
let conversationAudioChunks = [];

// ==================== LISTENER MANAGEMENT ====================

window.toggleEarRegistration = function () {
    if (!window.currentUser || !window.socket) return showError('Нет соединения');

    if (window.isEar) {
        window.socket.emit('unregister_listener', { userId: window.currentUser.id });
    } else {
        window.socket.emit('register_listener', {
            userId: window.currentUser.id,
            userData: {
                username: window.currentUser.username,
                email: window.currentUser.email
            }
        });
    }
};

window.loadAvailableListeners = async function () {
    try {
        const response = await fetch('/api/ears/list', {
            headers: { 'Authorization': 'Bearer ' + window.currentToken }
        });
        const data = await response.json();
        renderListeners(data.listeners || []);
    } catch (e) {
        console.error(e);
    }
};

function renderListeners(list) {
    const container = document.getElementById('listenersListContainer');
    if (!container) return;

    if (list.length === 0) {
        container.innerHTML = '<p class="text-center text-muted">Нет свободных слушателей</p>';
        return;
    }

    container.innerHTML = list.map(l => `
        <div class="listener-card glass-panel">
            <div class="listener-info">
                <strong>👤 ${l.username}</strong>
                <small>Онлайн</small>
            </div>
            <button class="btn btn-primary" onclick="startConversationWith(${l.id}, '${l.username}')">
                Начать чат
            </button>
        </div>
    `).join('');
}

// ==================== CONVERSATION LOGIC ====================

window.startConversationWith = async function (listenerId, listenerName) {
    try {
        const res = await fetch('/api/conversations/create', {
            method: 'POST',
            headers: { 
                'Content-Type': 'application/json',
                'Authorization': 'Bearer ' + window.currentToken 
            },
            body: JSON.stringify({ listenerId })
        });
        const data = await res.json();
        
        if (res.ok) {
            openConversationUI(data.conversation_id, listenerName, listenerId); // ID партнера важен для WebRTC
        } else {
            showError(data.error);
        }
    } catch (e) {
        showError(e.message);
    }
};

function openConversationUI(convId, partnerName, partnerId) {
    window.currentConversationId = convId;
    window.currentPartnerId = partnerId; // Для WebRTC звонков
    
    document.getElementById('conversationSection').classList.remove('hidden');
    const title = document.getElementById('conversationPartner');
    if (title) title.textContent = partnerName;
    
    loadMessages();
}

window.closeConversation = async function () {
    if (!window.currentConversationId) return;
    await fetch(`/api/conversations/${window.currentConversationId}/close`, {
        method: 'POST',
        headers: { 'Authorization': 'Bearer ' + window.currentToken }
    });
    window.currentConversationId = null;
    window.currentPartnerId = null;
    document.getElementById('conversationSection').classList.add('hidden');
    showSuccess('Чат завершен');
};

// ==================== MESSAGING & AUDIO ====================

window.sendConversationMessage = async function (isAudio = false) {
    const input = document.getElementById('conversationMessageInput');
    let text = input.value.trim();
    let mediaUrl = null;
    let mediaType = null;

    if (isAudio && conversationAudioChunks.length > 0) {
        // Upload audio
        const blob = new Blob(conversationAudioChunks, { type: 'audio/webm' });
        const formData = new FormData();
        formData.append('audio', blob, 'voice.webm');
        
        try {
            const upRes = await fetch('/api/upload/audio', {
                method: 'POST',
                headers: { 'Authorization': 'Bearer ' + window.currentToken },
                body: formData
            });
            const upData = await upRes.json();
            mediaUrl = upData.url;
            mediaType = 'audio/webm';
            text = '[Голосовое сообщение]';
        } catch (e) {
            return showError('Ошибка загрузки аудио');
        }
        conversationAudioChunks = [];
    } else if (!text) {
        return;
    }

    try {
        const res = await fetch(`/api/conversations/${window.currentConversationId}/message`, {
            method: 'POST',
            headers: { 
                'Content-Type': 'application/json',
                'Authorization': 'Bearer ' + window.currentToken 
            },
            body: JSON.stringify({ message: text, media_url: mediaUrl, media_type: mediaType })
        });
        
        if (res.ok) {
            input.value = '';
            const msgData = await res.json();
            appendConvMessage(msgData.message, true);
        }
    } catch (e) {
        showError(e.message);
    }
};

// Recording UI Controls
window.startConversationAudio = async function() {
    try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        conversationMediaRecorder = new MediaRecorder(stream);
        conversationAudioChunks = [];
        conversationMediaRecorder.ondataavailable = e => conversationAudioChunks.push(e.data);
        conversationMediaRecorder.start();

        // UI Toggle
        toggleRecUI(true);
    } catch (e) { showError('Микрофон недоступен'); }
};

window.stopConversationAudio = function() {
    if (conversationMediaRecorder) {
        conversationMediaRecorder.onstop = () => window.sendConversationMessage(true);
        conversationMediaRecorder.stop();
        toggleRecUI(false);
    }
};

window.cancelConversationAudio = function() {
    if (conversationMediaRecorder) conversationMediaRecorder.stop();
    conversationAudioChunks = [];
    toggleRecUI(false);
};

function toggleRecUI(isRecording) {
    document.getElementById('conversationRecordButton').style.display = isRecording ? 'none' : 'inline-block';
    document.getElementById('conversationStopButton').style.display = isRecording ? 'inline-block' : 'none';
    document.getElementById('conversationCancelButton').style.display = isRecording ? 'inline-block' : 'none';
}

// ==================== HELPERS ====================

async function loadMessages() {
    const res = await fetch(`/api/conversations/${window.currentConversationId}/messages`, {
        headers: { 'Authorization': 'Bearer ' + window.currentToken }
    });
    const msgs = await res.json();
    const container = document.getElementById('conversationMessages');
    container.innerHTML = '';
    msgs.forEach(m => appendConvMessage(m, m.sender_id === window.currentUser.id));
}

export function appendConvMessage(msg, isOwn) {
    const container = document.getElementById('conversationMessages');
    const div = document.createElement('div');
    div.className = `message ${isOwn ? 'user' : 'ai'}`; // 'ai' class is used for 'other' here in CSS
    
    let content = `<div>${msg.message_text}</div>`;
    if (msg.media_url) {
        content += `<audio controls src="${msg.media_url}" style="width:100%; margin-top:5px;"></audio>`;
    }
    div.innerHTML = content;
    container.appendChild(div);
    container.scrollTop = container.scrollHeight;
}

// Экспорт для сокетов
export function setupSocketListeners() {
    if (!window.socket) return;

    window.socket.on('listener_registered', () => {
        window.isEar = true;
        updateEarBtn('🎧 Перестать быть слушателем');
        showSuccess('Вы в эфире!');
    });

    window.socket.on('listener_unregistered', () => {
        window.isEar = false;
        updateEarBtn('🎧 Стать слушателем');
        showSuccess('Вы скрыты');
    });

    window.socket.on('new_conversation_request', (data) => {
        showSuccess(`Запрос от ${data.requester.username}`);
        openConversationUI(data.conversation_id, data.requester.username, data.requester.id);
    });

    window.socket.on('new_message', (msg) => {
        if (window.currentConversationId == msg.conversation_id) {
            appendConvMessage(msg, false);
        }
    });
}

function updateEarBtn(text) {
    const btn = document.getElementById('earToggleButton');
    if (btn) btn.textContent = text;
}

// Делаем функции доступными для кнопок HTML
window.toggleEarRegistration = toggleEarRegistration;
window.startConversationWith = startConversationWith;
window.closeConversation = closeConversation;
window.sendConversationMessage = sendConversationMessage;
window.startConversationAudio = startConversationAudio;
window.stopConversationAudio = stopConversationAudio;
window.cancelConversationAudio = cancelConversationAudio;

console.log('✅ Live Listeners module loaded');