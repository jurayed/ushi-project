// services/ai-chat-service.js
// 1-на-1 чат с локальным AI (Ollama). Стрим и обычный режим.

const { pool } = require('../models/database');
const { AI_PROVIDERS, DEFAULT_MODEL } = require('./ai-providers');
const { PSYCHOTYPES } = require('../config/constants');
const { generateSpeech } = require('./tts-service');

const MAX_HISTORY_MESSAGES = 60;
const MAX_HISTORY_CHARS = 30000;

const ollama = AI_PROVIDERS.ollama;

async function getUserName(userId) {
    try {
        const res = await pool.query('SELECT username FROM users WHERE id = $1', [userId]);
        return res.rows[0]?.username || 'User';
    } catch { return 'User'; }
}

async function fetchSmartHistory(userId) {
    try {
        const result = await pool.query(
            `SELECT message_text, is_ai_response, sent_at FROM messages
             WHERE user_id = $1 ORDER BY sent_at DESC LIMIT $2`,
            [userId, MAX_HISTORY_MESSAGES]
        );

        const messages = result.rows.reverse().map(m => ({
            role: m.is_ai_response ? 'assistant' : 'user',
            content: m.message_text
        }));

        let chars = 0;
        const smart = [];
        for (let i = messages.length - 1; i >= 0; i--) {
            const len = (messages[i].content || '').length;
            if (chars + len > MAX_HISTORY_CHARS) break;
            chars += len;
            smart.unshift(messages[i]);
        }
        return smart;
    } catch { return []; }
}

async function saveMessage(userId, text, isAi, psychotype, mediaUrl = null, mediaType = null) {
    try {
        await pool.query(
            `INSERT INTO messages (user_id, message_text, ai_psychotype, is_ai_response, media_url, media_type)
             VALUES ($1, $2, $3, $4, $5, $6)`,
            [userId, text, psychotype, isAi, mediaUrl || null, mediaType || null]
        );
    } catch (e) { console.error('saveMessage:', e.message); }
}

function buildSystemPrompt(customPrompt, psychotype, username) {
    const base = customPrompt
        || PSYCHOTYPES[psychotype]?.system_prompt
        || PSYCHOTYPES.empath.system_prompt;
    return `${base}\n\n[CONTEXT]\nUser Name: ${username}\nCurrent Date: ${new Date().toLocaleDateString()}`;
}

// === Обычный чат ===
async function handleAIChat(req, res) {
    const timings = { start: Date.now(), stt: 0, llm: 0, tts: 0 };

    try {
        const {
            message,
            psychotype = 'empath',
            model,
            voice_mode = false,
            stt_time = 0,
            systemPrompt: customPrompt
        } = req.body;

        timings.stt = stt_time;
        if (!message) return res.status(400).json({ error: 'Empty message' });

        const username = await getUserName(req.user.id);
        const sysPrompt = buildSystemPrompt(customPrompt, psychotype, username);

        await saveMessage(req.user.id, message, false, psychotype, req.body.media_url, req.body.media_type);
        const history = await fetchSmartHistory(req.user.id);

        const messages = [
            { role: 'system', content: sysPrompt },
            ...history,
            { role: 'user', content: message }
        ];

        const llmStart = Date.now();
        const aiResponse = await ollama.chat(sysPrompt, messages, model || DEFAULT_MODEL);
        timings.llm = Date.now() - llmStart;

        let audioUrl = null;
        if (voice_mode) {
            const ttsStart = Date.now();
            const ttsResult = await generateSpeech(aiResponse, `${Date.now()}-${req.user.id}`);
            if (ttsResult) {
                audioUrl = ttsResult.url;
                timings.tts = ttsResult.duration_ms || (Date.now() - ttsStart);
            }
        }

        await saveMessage(req.user.id, aiResponse, true, psychotype, audioUrl, audioUrl ? 'audio/wav' : null);

        res.json({
            success: true,
            response: aiResponse,
            psychotype: PSYCHOTYPES[psychotype]?.name || psychotype,
            provider: ollama.name,
            audio_url: audioUrl,
            timings: { ...timings, total: Date.now() - timings.start }
        });
    } catch (error) {
        console.error('Chat Error:', error);
        res.status(500).json({ error: error.message });
    }
}

// === Стрим ===
async function handleAIStream(req, res) {
    try {
        const {
            message,
            psychotype = 'empath',
            model,
            systemPrompt: customPrompt
        } = req.body;
        if (!message) return res.status(400).json({ error: 'Empty message' });

        const username = await getUserName(req.user.id);
        const sysPrompt = buildSystemPrompt(customPrompt, psychotype, username);

        res.writeHead(200, {
            'Content-Type': 'text/plain; charset=utf-8',
            'Transfer-Encoding': 'chunked'
        });

        await saveMessage(req.user.id, message, false, psychotype, req.body.media_url, req.body.media_type);
        const history = await fetchSmartHistory(req.user.id);

        const messages = [
            { role: 'system', content: sysPrompt },
            ...history,
            { role: 'user', content: message }
        ];

        let fullResponse = '';
        for await (const chunk of ollama.streamChunks(sysPrompt, messages, model || DEFAULT_MODEL)) {
            fullResponse += chunk;
            res.write(chunk);
        }

        if (fullResponse.trim()) {
            await saveMessage(req.user.id, fullResponse, true, psychotype);
        }
        res.end();
    } catch (error) {
        console.error('Stream Error:', error.message);
        try { res.write(`\n[Error: ${error.message}]`); } catch {}
        res.end();
    }
}

async function getChatHistory(req, res) {
    try {
        const limit = parseInt(req.query.limit) || 50;
        const beforeId = parseInt(req.query.beforeId) || 2147483647;

        const result = await pool.query(
            `SELECT id, message_text, is_ai_response, sent_at, ai_psychotype, media_url, media_type
             FROM messages
             WHERE user_id = $1 AND id < $2
             ORDER BY id DESC
             LIMIT $3`,
            [req.user.id, beforeId, limit]
        );

        res.json(result.rows.reverse());
    } catch (error) {
        console.error('History Error:', error);
        res.status(500).json({ error: 'Db Error' });
    }
}

module.exports = { handleAIChat, handleAIStream, getChatHistory };
