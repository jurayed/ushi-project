// services/room-ai-service.js
// AI-участник в групповых комнатах.
// Вызывается после каждого пользовательского сообщения если:
//  - ai_enabled = true И
//  - (в сообщении есть @ai|@bot|/ai ИЛИ room.ai_auto_respond = true)

const Rooms = require('../models/rooms');
const { AI_PROVIDERS, DEFAULT_MODEL } = require('./ai-providers');
const { PSYCHOTYPES } = require('../config/constants');

const ollama = AI_PROVIDERS.ollama;
const MAX_HISTORY_MESSAGES = 40;
const MAX_HISTORY_CHARS = 20000;

const MENTION_RE = /(^|\s)(@ai|@bot|\/ai)(\s|:|,|$)/i;

function isMentioned(text) {
    if (!text) return false;
    return MENTION_RE.test(text);
}

function shouldRespond(room, messageText) {
    if (!room.ai_enabled) return false;
    if (room.ai_auto_respond) return true;
    return isMentioned(messageText);
}

async function buildHistoryForLLM(roomId) {
    const raw = await Rooms.getRoomMessages(roomId, { limit: MAX_HISTORY_MESSAGES });
    // Trim by chars
    let chars = 0;
    const trimmed = [];
    for (let i = raw.length - 1; i >= 0; i--) {
        const m = raw[i];
        const text = (m.message_text || '').trim();
        if (!text) continue;
        const label = m.is_ai ? 'AI' : (m.sender_username || `User${m.sender_id}`);
        const line = `${label}: ${text}`;
        if (chars + line.length > MAX_HISTORY_CHARS) break;
        chars += line.length;
        trimmed.unshift({
            role: m.is_ai ? 'assistant' : 'user',
            content: m.is_ai ? text : line
        });
    }
    return trimmed;
}

function buildSystemPrompt(room) {
    const base = PSYCHOTYPES[room.ai_psychotype]?.system_prompt
        || PSYCHOTYPES.empath.system_prompt;

    return [
        base,
        '',
        `[GROUP CONTEXT]`,
        `You are an AI participant in a group chat called "${room.name}".`,
        `Multiple human users are participating. Each human message is prefixed with their username and colon (e.g., "Alice: hello").`,
        `Your replies should be concise (1-3 sentences) unless the situation clearly warrants more.`,
        `Do not prefix your own reply with any name or "AI:" — reply naturally.`,
        `You may be addressed via @ai or @bot or /ai mentions.`,
        `Respond in the same language the last user used (Russian / Uzbek / English).`
    ].join('\n');
}

async function respondToRoom(roomId, { onChunk = null } = {}) {
    const room = await Rooms.getRoomById(roomId);
    if (!room || !room.ai_enabled) return null;

    const sysPrompt = buildSystemPrompt(room);
    const history = await buildHistoryForLLM(roomId);

    const messages = [
        { role: 'system', content: sysPrompt },
        ...history
    ];

    const model = room.ai_model || DEFAULT_MODEL;

    let full = '';
    try {
        for await (const chunk of ollama.streamChunks(sysPrompt, messages, model)) {
            full += chunk;
            if (onChunk) onChunk(chunk);
        }
    } catch (err) {
        console.error('Room AI error:', err.message);
        full = `[AI error: ${err.message}]`;
        if (onChunk) onChunk(full);
    }

    const text = full.trim();
    if (!text) return null;

    const saved = await Rooms.addRoomMessage({
        roomId,
        senderId: null,
        isAi: true,
        text
    });
    return saved;
}

module.exports = {
    shouldRespond,
    isMentioned,
    respondToRoom
};
