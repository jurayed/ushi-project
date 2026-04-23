// public/js/rooms.js — групповые комнаты
import { showError, showSuccess } from './ui.js';

let activeRoomId = null;
let currentTab = 'my';
let currentAiBubble = null;

function authHeaders(extra = {}) {
    return {
        'Authorization': 'Bearer ' + window.currentToken,
        ...extra
    };
}

// === Список комнат ===
window.loadRooms = async function (tab = currentTab) {
    currentTab = tab;
    document.querySelectorAll('.room-tab').forEach(b => {
        b.classList.toggle('active', b.dataset.tab === tab);
    });

    try {
        const endpoint = tab === 'my' ? '/api/rooms/my' : '/api/rooms/public';
        const res = await fetch(endpoint, { headers: authHeaders() });
        const rooms = await res.json();
        renderRoomsList(rooms, tab);
    } catch (e) {
        showError('Ошибка загрузки комнат: ' + e.message);
    }
};

window.switchRoomTab = function (tab) {
    window.loadRooms(tab);
};

function renderRoomsList(rooms, tab) {
    const container = document.getElementById('roomsListContainer');
    if (!container) return;

    if (!rooms || rooms.length === 0) {
        container.innerHTML = `<p style="text-align:center; opacity:0.6; margin-top:30px;">
            ${tab === 'my' ? 'Ты не в одной комнате. Создай или зайди в публичную.' : 'Публичных комнат пока нет. Создай первую!'}
        </p>`;
        return;
    }

    container.innerHTML = rooms.map(r => `
        <div class="room-card glass-panel">
            <div class="room-card-info">
                <strong>${escapeHtml(r.name)}</strong>
                ${r.description ? `<div class="room-desc">${escapeHtml(r.description)}</div>` : ''}
                <div class="room-meta">
                    👥 ${r.participant_count || 1}
                    ${r.ai_enabled ? ' · 🤖 AI' : ''}
                    ${r.is_public ? ' · 🌍' : ' · 🔒'}
                </div>
            </div>
            <div class="room-card-actions">
                ${tab === 'my' || r.is_member
                    ? `<button class="btn btn-primary" onclick="openRoom(${r.id}, '${escapeJs(r.name)}')">Войти</button>`
                    : `<button class="btn btn-secondary" onclick="joinRoomAndOpen(${r.id}, '${escapeJs(r.name)}')">Присоединиться</button>`
                }
            </div>
        </div>
    `).join('');
}

window.joinRoomAndOpen = async function (roomId, name) {
    try {
        const res = await fetch(`/api/rooms/${roomId}/join`, {
            method: 'POST',
            headers: authHeaders()
        });
        if (!res.ok) {
            const data = await res.json();
            return showError(data.error || 'Не удалось зайти');
        }
        openRoom(roomId, name);
    } catch (e) {
        showError(e.message);
    }
};

// === Открытие комнаты ===
window.openRoom = async function (roomId, name) {
    activeRoomId = roomId;
    document.getElementById('roomsListView').classList.add('hidden');
    document.getElementById('roomChatView').classList.remove('hidden');
    document.getElementById('roomChatTitle').textContent = name || 'Комната';
    document.getElementById('roomMessages').innerHTML = '';

    if (window.socket) {
        window.socket.emit('join_room_channel', { roomId });
    }

    await loadRoomMessages(roomId);
    await loadRoomParticipants(roomId);
};

window.closeRoomView = function () {
    if (activeRoomId && window.socket) {
        window.socket.emit('leave_room_channel', { roomId: activeRoomId });
    }
    activeRoomId = null;
    document.getElementById('roomChatView').classList.add('hidden');
    document.getElementById('roomsListView').classList.remove('hidden');
    window.loadRooms();
};

async function loadRoomMessages(roomId) {
    try {
        const res = await fetch(`/api/rooms/${roomId}/messages?limit=100`, { headers: authHeaders() });
        const msgs = await res.json();
        const c = document.getElementById('roomMessages');
        c.innerHTML = '';
        msgs.forEach(m => appendRoomMessage(m));
        scrollRoomToBottom();
    } catch (e) {
        console.error(e);
    }
}

async function loadRoomParticipants(roomId) {
    try {
        const res = await fetch(`/api/rooms/${roomId}`, { headers: authHeaders() });
        const data = await res.json();
        const names = (data.participants || []).map(p => p.username).join(', ');
        const el = document.getElementById('roomChatParticipants');
        if (el) el.textContent = names + (data.room?.ai_enabled ? ' · 🤖' : '');
    } catch {}
}

function appendRoomMessage(msg) {
    const container = document.getElementById('roomMessages');
    if (!container) return;

    const isMine = !msg.is_ai && msg.sender_id === window.currentUser?.id;
    const div = document.createElement('div');
    div.className = `message ${isMine ? 'sent' : 'received'} ${msg.is_ai ? 'room-ai-msg' : ''}`;
    div.dataset.msgId = msg.id || '';

    const label = msg.is_ai ? '🤖 AI' : (msg.sender_username || 'User');
    const time = msg.sent_at
        ? new Date(msg.sent_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
        : '';

    let html = `<div class="msg-author">${escapeHtml(label)}</div>`;
    html += `<div class="message-content">${escapeHtml(msg.message_text || '')}</div>`;
    if (msg.media_url) {
        html += `<audio controls src="${msg.media_url}" style="margin-top:5px;"></audio>`;
    }
    if (time) html += `<span class="msg-time">${time}</span>`;

    div.innerHTML = html;
    container.appendChild(div);
    scrollRoomToBottom();
    return div;
}

function scrollRoomToBottom() {
    const c = document.getElementById('roomMessages');
    if (c) c.scrollTop = c.scrollHeight;
}

// === Отправка ===
window.sendRoomMessage = async function () {
    const input = document.getElementById('roomMessageInput');
    const text = input.value.trim();
    if (!text || !activeRoomId) return;
    input.value = '';

    try {
        const res = await fetch(`/api/rooms/${activeRoomId}/message`, {
            method: 'POST',
            headers: authHeaders({ 'Content-Type': 'application/json' }),
            body: JSON.stringify({ message: text })
        });
        if (!res.ok) {
            const data = await res.json();
            showError(data.error || 'Ошибка отправки');
        }
        // Сообщение придёт через socket 'room_message' — не апендим руками
    } catch (e) {
        showError(e.message);
    }
};

// === Создание комнаты ===
window.toggleCreateRoomModal = function (show) {
    const modal = document.getElementById('createRoomModal');
    if (!modal) return;
    if (show) modal.classList.remove('hidden');
    else modal.classList.add('hidden');
};

window.submitCreateRoom = async function () {
    const name = document.getElementById('newRoomName').value.trim();
    if (!name) return showError('Название обязательно');

    const payload = {
        name,
        description: document.getElementById('newRoomDesc').value.trim() || null,
        is_public: document.getElementById('newRoomPublic').checked,
        ai_enabled: document.getElementById('newRoomAiEnabled').checked,
        ai_auto_respond: document.getElementById('newRoomAiAuto').checked,
        ai_psychotype: document.getElementById('newRoomAiPsychotype').value
    };

    try {
        const res = await fetch('/api/rooms', {
            method: 'POST',
            headers: authHeaders({ 'Content-Type': 'application/json' }),
            body: JSON.stringify(payload)
        });
        const data = await res.json();
        if (!res.ok) return showError(data.error || 'Не создалось');

        toggleCreateRoomModal(false);
        showSuccess('Комната создана!');
        ['newRoomName', 'newRoomDesc'].forEach(id => document.getElementById(id).value = '');
        openRoom(data.id, data.name);
    } catch (e) {
        showError(e.message);
    }
};

// === Настройки комнаты (заглушка — покажем JSON и разрешим toggle AI) ===
window.toggleRoomSettings = async function (show) {
    const modal = document.getElementById('roomSettingsModal');
    if (!modal) return;
    if (show === false) return modal.classList.add('hidden');
    if (!activeRoomId) return;

    try {
        const res = await fetch(`/api/rooms/${activeRoomId}`, { headers: authHeaders() });
        const data = await res.json();
        const r = data.room;
        const isAdmin = (data.participants || []).some(p => p.id === window.currentUser?.id && p.role === 'admin');

        document.getElementById('roomSettingsBody').innerHTML = `
            <p><strong>Имя:</strong> ${escapeHtml(r.name)}</p>
            <p><strong>Описание:</strong> ${escapeHtml(r.description || '—')}</p>
            <p><strong>Участников:</strong> ${(data.participants || []).length}</p>
            <p><strong>AI:</strong> ${r.ai_enabled ? 'вкл' : 'выкл'} · ${r.ai_auto_respond ? 'авто-ответ' : 'по @ai'} · ${r.ai_psychotype || 'empath'}</p>
            ${isAdmin ? `
                <hr style="margin:10px 0;">
                <label><input type="checkbox" id="setAiEnabled" ${r.ai_enabled ? 'checked' : ''}> AI участвует</label><br>
                <label><input type="checkbox" id="setAiAuto" ${r.ai_auto_respond ? 'checked' : ''}> Авто-ответ</label><br>
                <button class="btn btn-primary w-100" style="margin-top:15px;" onclick="saveRoomSettings()">Сохранить</button>
                <button class="btn btn-danger w-100" style="margin-top:5px;" onclick="closeRoomConfirm()">Закрыть комнату</button>
            ` : '<p style="opacity:0.6; margin-top:10px;">Только админ может менять настройки.</p>'}
            <button class="btn btn-secondary w-100" style="margin-top:10px;" onclick="leaveRoomConfirm()">Покинуть комнату</button>
        `;
        modal.classList.remove('hidden');
    } catch (e) {
        showError(e.message);
    }
};

window.saveRoomSettings = async function () {
    const body = {
        ai_enabled: document.getElementById('setAiEnabled').checked,
        ai_auto_respond: document.getElementById('setAiAuto').checked
    };
    try {
        const res = await fetch(`/api/rooms/${activeRoomId}`, {
            method: 'PATCH',
            headers: authHeaders({ 'Content-Type': 'application/json' }),
            body: JSON.stringify(body)
        });
        if (res.ok) {
            showSuccess('Сохранено');
            toggleRoomSettings(false);
            loadRoomParticipants(activeRoomId);
        } else {
            const d = await res.json();
            showError(d.error || 'Ошибка');
        }
    } catch (e) { showError(e.message); }
};

window.leaveRoomConfirm = async function () {
    if (!confirm('Покинуть комнату?')) return;
    await fetch(`/api/rooms/${activeRoomId}/leave`, { method: 'POST', headers: authHeaders() });
    toggleRoomSettings(false);
    closeRoomView();
};

window.closeRoomConfirm = async function () {
    if (!confirm('Закрыть комнату для всех? Это нельзя отменить.')) return;
    const res = await fetch(`/api/rooms/${activeRoomId}/close`, { method: 'POST', headers: authHeaders() });
    if (res.ok) {
        showSuccess('Комната закрыта');
        toggleRoomSettings(false);
        closeRoomView();
    } else {
        const d = await res.json();
        showError(d.error || 'Ошибка');
    }
};

// === Сокет слушатели ===
export function setupRoomSocketListeners() {
    if (!window.socket) return;

    window.socket.on('room_message', (msg) => {
        if (activeRoomId && msg.room_id === activeRoomId) appendRoomMessage(msg);
    });

    window.socket.on('room_ai_typing', ({ room_id }) => {
        if (activeRoomId !== room_id) return;
        document.getElementById('roomAiTypingIndicator')?.classList.remove('hidden');
    });

    window.socket.on('room_ai_chunk', ({ room_id, text }) => {
        if (activeRoomId !== room_id) return;
        if (!currentAiBubble) {
            currentAiBubble = appendRoomMessage({
                is_ai: true,
                sender_username: 'AI',
                message_text: '',
                sent_at: new Date().toISOString()
            });
        }
        const contentDiv = currentAiBubble.querySelector('.message-content');
        if (contentDiv) {
            contentDiv.textContent += text;
            scrollRoomToBottom();
        }
    });

    window.socket.on('room_ai_message', (msg) => {
        if (activeRoomId !== msg.room_id) return;
        // Финальное сохранённое сообщение. Если стрим-пузырь есть — обновляем id + проставляем время.
        if (currentAiBubble) {
            currentAiBubble.dataset.msgId = msg.id;
            const t = currentAiBubble.querySelector('.msg-time');
            if (t) t.textContent = new Date(msg.sent_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
            currentAiBubble = null;
        } else {
            appendRoomMessage(msg);
        }
    });

    window.socket.on('room_ai_done', ({ room_id }) => {
        if (activeRoomId !== room_id) return;
        document.getElementById('roomAiTypingIndicator')?.classList.add('hidden');
        currentAiBubble = null;
    });

    window.socket.on('room_user_joined', ({ room_id, username }) => {
        if (activeRoomId === room_id) {
            showSuccess(`${username} зашёл в комнату`);
            loadRoomParticipants(room_id);
        }
    });

    window.socket.on('room_user_left', ({ room_id, username }) => {
        if (activeRoomId === room_id) {
            showSuccess(`${username} вышел`);
            loadRoomParticipants(room_id);
        }
    });
}

// === Helpers ===
function escapeHtml(s) {
    if (s == null) return '';
    return String(s).replace(/[&<>"']/g, c => ({
        '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    }[c]));
}

function escapeJs(s) {
    return String(s || '').replace(/['\\]/g, '\\$&');
}

// Enter отправляет сообщение
document.addEventListener('DOMContentLoaded', () => {
    const input = document.getElementById('roomMessageInput');
    if (input) {
        input.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') window.sendRoomMessage();
        });
    }
});

console.log('✅ Rooms module loaded');
