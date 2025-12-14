import { showError, showSuccess, showInfo } from './ui.js';

// Глобальные переменные
let availableProviders = [];
let availableModels = {};
let mediaRecorder = null;
let audioChunks = [];

// ==================== MAIN CHAT LOGIC ====================

window.testAIChat = async function () {
    if (!window.currentToken) return showError('Сначала войдите в систему');

    const message = document.getElementById('messageInput')?.value.trim();
    if (!message) return showError('Введите сообщение');

    // Очистка
    document.getElementById('messageInput').value = '';
    
    // Отображаем (User)
    appendMessage('user', message);

    const params = getChatParams();
    if (params.useStreaming) {
        await chatStream(params.psychotype, params.provider, params.model, message);
    } else {
        await chatRegular(params.psychotype, params.provider, params.model, message);
    }
};

function getChatParams() {
    return {
        psychotype: document.getElementById('psychotype')?.value || 'empath',
        provider: document.getElementById('provider')?.value || 'deepseek',
        model: document.getElementById('model')?.value,
        useStreaming: document.getElementById('useStreaming')?.checked
    };
}

// ==================== NETWORKING ====================

async function chatRegular(psychotype, provider, model, message) {
    toggleTyping(true);
    try {
        const response = await fetch('/api/chat/ai', {
            method: 'POST',
            headers: { 
                'Content-Type': 'application/json',
                'Authorization': 'Bearer ' + window.currentToken 
            },
            body: JSON.stringify({ message, psychotype, provider, model })
        });
        const data = await response.json();
        
        toggleTyping(false);
        if (data.success) {
            appendMessage('ai', data.response, { psychotype: data.psychotype });
        } else {
            showError('AI Error: ' + data.error);
        }
    } catch (e) {
        toggleTyping(false);
        showError(e.message);
    }
}

async function chatStream(psychotype, provider, model, message) {
    // Создаем пустой пузырь
    const messageDiv = appendMessage('ai', '...', { psychotype });
    const contentDiv = messageDiv.querySelector('.message-content');
    
    try {
        const response = await fetch('/api/chat/ai/stream', {
            method: 'POST',
            headers: { 
                'Content-Type': 'application/json',
                'Authorization': 'Bearer ' + window.currentToken 
            },
            body: JSON.stringify({ message, psychotype, provider, model })
        });

        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let fullText = '';

        while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            const chunk = decoder.decode(value);
            fullText += chunk;
            contentDiv.textContent = fullText;
            scrollToBottom();
        }
    } catch (e) {
        contentDiv.innerHTML += `<br><span style="color:red">Error: ${e.message}</span>`;
    }
}

// ==================== AUDIO & TRANSCRIPTION ====================

// Hold-to-Record Logic (Объединена из chat-enhancements)
export function setupHoldToRecord() {
    const btn = document.getElementById('recordButton');
    if (!btn) return;

    // Очистка старых событий
    const newBtn = btn.cloneNode(true);
    btn.parentNode.replaceChild(newBtn, btn);

    const startRec = (e) => { e.preventDefault(); window.startAudioMessage(); newBtn.classList.add('recording-active'); };
    const stopRec = (e) => { e.preventDefault(); window.stopAudioMessage(); newBtn.classList.remove('recording-active'); };

    newBtn.addEventListener('mousedown', startRec);
    newBtn.addEventListener('mouseup', stopRec);
    newBtn.addEventListener('touchstart', startRec);
    newBtn.addEventListener('touchend', stopRec);
}

window.startAudioMessage = async function() {
    try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        mediaRecorder = new MediaRecorder(stream);
        audioChunks = [];
        
        mediaRecorder.ondataavailable = e => audioChunks.push(e.data);
        mediaRecorder.onstop = () => sendAudioWithTranscription();
        
        mediaRecorder.start();
        showInfo('🎙️ Запись...');
    } catch (e) {
        showError('Ошибка микрофона');
    }
};

window.stopAudioMessage = function() {
    if (mediaRecorder && mediaRecorder.state !== 'inactive') mediaRecorder.stop();
};

async function sendAudioWithTranscription() {
    if (audioChunks.length === 0) return;
    const blob = new Blob(audioChunks, { type: 'audio/webm' });
    const formData = new FormData();
    formData.append('audio', blob, 'voice.webm');

    try {
        showInfo('⏳ Обработка аудио...');
        
        // 1. Транскрибация
        const res = await fetch('/api/upload/transcribe', {
            method: 'POST',
            headers: { 'Authorization': 'Bearer ' + window.currentToken },
            body: formData
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error);

        // 2. Отображаем аудио и текст
        appendMessage('user', data.text, { media_url: data.url, media_type: 'audio/webm' });

        // 3. Отправляем текст ИИ
        const params = getChatParams();
        const payload = {
            message: data.text,
            psychotype: params.psychotype,
            provider: params.provider,
            model: params.model,
            media_url: data.url,
            media_type: 'audio/webm'
        };

        if (params.useStreaming) {
            await chatStream(params.psychotype, params.provider, params.model, data.text);
        } else {
            const aiRes = await fetch('/api/chat/ai', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + window.currentToken },
                body: JSON.stringify(payload)
            });
            const aiData = await aiRes.json();
            if (aiData.success) {
                appendMessage('ai', aiData.response, { psychotype: aiData.psychotype });
            }
        }
    } catch (e) {
        showError('Ошибка аудио: ' + e.message);
    }
}

// ==================== PROVIDERS & HISTORY ====================

window.loadProviders = async function() {
    try {
        const res = await fetch('/api/providers');
        const providers = await res.json();
        
        const select = document.getElementById('provider');
        select.innerHTML = '';
        availableModels = {};

        providers.forEach(p => {
            if (p.enabled) {
                const opt = document.createElement('option');
                opt.value = p.id;
                opt.textContent = p.name;
                select.appendChild(opt);
                availableModels[p.id] = p.models;
            }
        });
        
        select.addEventListener('change', updateModels);
        updateModels(); // Init models
    } catch (e) {
        console.error(e);
    }
};

function updateModels() {
    const providerId = document.getElementById('provider').value;
    const select = document.getElementById('model');
    select.innerHTML = '';
    
    if (availableModels[providerId]) {
        Object.entries(availableModels[providerId]).forEach(([id, info]) => {
            const opt = document.createElement('option');
            opt.value = id;
            opt.textContent = `${info.name} (${info.context} tok)`;
            select.appendChild(opt);
        });
    }
}

window.loadChatHistory = async function() {
    const container = document.getElementById('aiChatContainer');
    if (!container) return;
    container.innerHTML = '';

    const res = await fetch('/api/chat/ai/history', {
        headers: { 'Authorization': 'Bearer ' + window.currentToken }
    });
    const msgs = await res.json();
    msgs.forEach(m => {
        appendMessage(
            m.is_ai_response ? 'ai' : 'user', 
            m.message_text, 
            { media_url: m.media_url, media_type: m.media_type, psychotype: m.ai_psychotype }
        );
    });
};

// ==================== UI HELPERS ====================

function appendMessage(role, text, meta = {}) {
    const container = document.getElementById('aiChatContainer');
    if (!container) return;

    const div = document.createElement('div');
    div.className = `message ${role === 'user' ? 'sent' : 'received'}`;
    
    let html = '';
    if (meta.media_url) {
        html += `<audio controls src="${meta.media_url}" style="max-width:200px;"></audio><br>`;
    }
    html += `<div class="message-content">${text || ''}</div>`;
    if (role === 'ai') {
        html += `<div class="message-meta">${meta.psychotype || 'AI'}</div>`;
    }
    
    div.innerHTML = html;
    container.appendChild(div);
    scrollToBottom();
    return div;
}

function scrollToBottom() {
    const c = document.getElementById('aiChatContainer');
    c.scrollTop = c.scrollHeight;
}

function toggleTyping(show) {
    const el = document.getElementById('typingIndicator');
    if (el) el.style.display = show ? 'block' : 'none';
}

// Обработчик Enter
document.addEventListener('DOMContentLoaded', () => {
    document.getElementById('messageInput')?.addEventListener('keypress', (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            window.testAIChat();
        }
    });
    // Init Hold to Record
    setupHoldToRecord();
});

// Экспорт глобальных функций
window.testAIChat = testAIChat;
window.loadProviders = loadProviders;
window.loadChatHistory = loadChatHistory;

console.log('✅ AI Chat module loaded');