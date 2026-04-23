// services/ai-stream.js
// Live voice session (WebSocket). Полностью локальный стек:
//   STT: faster-whisper-server (chunk-based, после паузы клиента)
//   LLM: Ollama (stream)
//   TTS: Piper / XTTS (по предложениям)
//
// Протокол сокета (клиент ↔ сервер) — без изменений для фронта:
//   client → server: 'start_voice_chat' {systemPrompt, model, language?}
//   client → server: 'audio_stream_data' <Int16 PCM chunk ArrayBuffer>
//   client → server: 'audio_segment_end' (когда клиент обнаружил конец фразы)
//   client → server: 'stop_voice_chat'
//
//   server → client: 'user_transcription' {text, isFinal}
//   server → client: 'ai_text_chunk' {text}
//   server → client: 'ai_audio_chunk' <buffer>
//   server → client: 'ai_response_complete'
//   server → client: 'latency_metric' {type, value}

const { pool } = require('../models/database');
const { AI_PROVIDERS, DEFAULT_MODEL } = require('./ai-providers');
const { transcribeAudio } = require('./transcription-service');
const { synthesizeToBuffer } = require('./tts-service');

const ollama = AI_PROVIDERS.ollama;

async function getUserName(userId) {
    try {
        const res = await pool.query('SELECT username FROM users WHERE id = $1', [userId]);
        return res.rows[0]?.username || 'User';
    } catch { return 'User'; }
}

async function fetchHistory(userId) {
    try {
        const result = await pool.query(
            `SELECT message_text, is_ai_response FROM messages WHERE user_id = $1 ORDER BY sent_at DESC LIMIT 20`,
            [userId]
        );
        return result.rows.reverse().map(m => ({
            role: m.is_ai_response ? 'assistant' : 'user',
            content: m.message_text
        }));
    } catch { return []; }
}

async function saveMessage(userId, text, isAi) {
    try {
        await pool.query(
            'INSERT INTO messages (user_id, message_text, is_ai_response, ai_psychotype) VALUES ($1, $2, $3, $4)',
            [userId, text, isAi, 'voice-mode']
        );
    } catch {}
}

// PCM Int16 → WAV (моно, 16kHz) — для Whisper.
// На входе у нас сырые PCM чанки; склеиваем и оборачиваем в минимальный WAV-заголовок.
function pcmToWav(pcmBuffers, sampleRate = 16000) {
    const totalLen = pcmBuffers.reduce((s, b) => s + b.length, 0);
    const data = Buffer.concat(pcmBuffers, totalLen);

    const header = Buffer.alloc(44);
    header.write('RIFF', 0);
    header.writeUInt32LE(36 + data.length, 4);
    header.write('WAVE', 8);
    header.write('fmt ', 12);
    header.writeUInt32LE(16, 16);           // fmt chunk size
    header.writeUInt16LE(1, 20);            // PCM
    header.writeUInt16LE(1, 22);            // mono
    header.writeUInt32LE(sampleRate, 24);
    header.writeUInt32LE(sampleRate * 2, 28); // byteRate = sampleRate * channels * bytesPerSample
    header.writeUInt16LE(2, 32);            // blockAlign
    header.writeUInt16LE(16, 34);           // bitsPerSample
    header.write('data', 36);
    header.writeUInt32LE(data.length, 40);

    return Buffer.concat([header, data]);
}

class AiStreamSession {
    constructor(socket, userId) {
        this.socket = socket;
        this.userId = userId;
        this.isProcessing = false;
        this.pcmBuffers = [];
        this.systemPrompt = 'Ты эмпатичный собеседник.';
        this.model = DEFAULT_MODEL;
        this.language = ''; // '' = авто
        this.metrics = { stt: 0, llm: 0, tts: 0 };
    }

    start(config = {}) {
        if (config.systemPrompt) this.systemPrompt = config.systemPrompt;
        if (config.model) this.model = config.model;
        if (config.language) this.language = config.language;
        console.log(`🎤 Live voice start: model=${this.model}, user=${this.userId}`);
    }

    handleAudioChunk(chunk) {
        // chunk — ArrayBuffer с Int16 PCM. Сохраняем как Buffer.
        const buf = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
        this.pcmBuffers.push(buf);
    }

    async handleSegmentEnd() {
        if (this.isProcessing) return;
        if (this.pcmBuffers.length === 0) return;
        this.isProcessing = true;

        const pcm = this.pcmBuffers;
        this.pcmBuffers = [];

        try {
            // 1) STT
            const sttStart = Date.now();
            const wav = pcmToWav(pcm, 16000);
            if (wav.length < 5000) {
                // слишком короткий сегмент — вероятно тишина
                this.isProcessing = false;
                return;
            }
            const { text } = await transcribeAudio(wav, 'segment.wav', this.language || null);
            const sttMs = Date.now() - sttStart;
            this.sendMetric('stt', sttMs);

            if (!text || !text.trim()) {
                this.isProcessing = false;
                return;
            }

            this.socket.emit('user_transcription', { text, isFinal: true });
            await this.runLLM(text);
        } catch (err) {
            console.error('Voice segment error:', err.message);
            this.socket.emit('ai_text_chunk', { text: ` [Ошибка: ${err.message}]` });
            this.socket.emit('ai_response_complete');
        } finally {
            this.isProcessing = false;
        }
    }

    async runLLM(userText) {
        await saveMessage(this.userId, userText, false);
        const history = await fetchHistory(this.userId);
        const username = await getUserName(this.userId);
        const sysPrompt = `${this.systemPrompt}\n\n[CONTEXT]\nUser: ${username}`;

        const messages = [
            { role: 'system', content: sysPrompt },
            ...history,
            { role: 'user', content: userText }
        ];

        const llmStart = Date.now();
        let firstByte = 0;
        let sentenceBuf = '';
        let fullResponse = '';

        for await (const chunk of ollama.streamChunks(sysPrompt, messages, this.model)) {
            if (!firstByte) {
                firstByte = Date.now();
                this.sendMetric('llm', firstByte - llmStart);
            }
            sentenceBuf += chunk;
            fullResponse += chunk;
            this.socket.emit('ai_text_chunk', { text: chunk });

            if (this.hasSentenceEnd(chunk)) {
                const piece = sentenceBuf.trim();
                sentenceBuf = '';
                if (piece.length > 2) await this.sendAudio(piece);
            }
        }

        const tail = sentenceBuf.trim();
        if (tail.length > 0) await this.sendAudio(tail);

        await saveMessage(this.userId, fullResponse, true);
        this.socket.emit('ai_response_complete');
    }

    hasSentenceEnd(chunk) {
        return /[.!?…\n]/.test(chunk);
    }

    async sendAudio(text) {
        try {
            const ttsStart = Date.now();
            const { buffer } = await synthesizeToBuffer(text, { language: this.language || undefined });
            this.sendMetric('tts', Date.now() - ttsStart);
            this.socket.emit('ai_audio_chunk', buffer);
        } catch (err) {
            console.error('TTS chunk error:', err.message);
        }
    }

    sendMetric(type, value) {
        this.socket.emit('latency_metric', { type, value });
    }

    stop() {
        this.pcmBuffers = [];
        this.isProcessing = false;
    }
}

const sessions = new Map();

module.exports = {
    handleStreamConnection: (socket) => {
        socket.on('start_voice_chat', (config) => {
            if (!socket.userId) {
                socket.emit('ai_text_chunk', { text: '[Не авторизован]' });
                return;
            }
            const session = new AiStreamSession(socket, socket.userId);
            sessions.set(socket.id, session);
            session.start(config || {});
        });

        socket.on('audio_stream_data', (chunk) => {
            const session = sessions.get(socket.id);
            if (session) session.handleAudioChunk(chunk);
        });

        socket.on('audio_segment_end', () => {
            const session = sessions.get(socket.id);
            if (session) session.handleSegmentEnd();
        });

        socket.on('stop_voice_chat', () => {
            const session = sessions.get(socket.id);
            if (session) session.stop();
            sessions.delete(socket.id);
        });

        socket.on('disconnect', () => {
            const session = sessions.get(socket.id);
            if (session) session.stop();
            sessions.delete(socket.id);
        });
    }
};
