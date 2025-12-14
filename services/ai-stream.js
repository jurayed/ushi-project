// services/ai-stream.js
const { createClient, LiveTranscriptionEvents } = require('@deepgram/sdk');
const { OpenAI } = require('openai');
const { pool } = require('../models/database');

const deepgram = createClient(process.env.DEEPGRAM_API_KEY);
const openaiBase = new OpenAI({ apiKey: process.env.OPENAI_API_KEY }); // Fallback + TTS

async function getUserName(userId) {
    try {
        const res = await pool.query('SELECT username FROM users WHERE id = $1', [userId]);
        return res.rows[0]?.username || 'User';
    } catch (e) { return 'User'; }
}

async function fetchHistory(userId) {
    try {
        const result = await pool.query(
            `SELECT message_text, is_ai_response FROM messages WHERE user_id = $1 ORDER BY sent_at DESC LIMIT 20`,
            [userId]
        );
        return result.rows.reverse().map(msg => ({
            role: msg.is_ai_response ? 'assistant' : 'user',
            content: msg.message_text
        }));
    } catch (e) { return []; }
}

async function saveMessage(userId, text, isAi) {
    try {
        await pool.query(
            'INSERT INTO messages (user_id, message_text, is_ai_response, ai_psychotype) VALUES ($1, $2, $3, $4)',
            [userId, text, isAi, 'voice-mode']
        );
    } catch (e) {}
}

class AiStreamSession {
    constructor(socket, userId) {
        this.socket = socket;
        this.userId = userId;
        this.dgConnection = null;
        this.isProcessing = false;
        this.sentenceBuffer = ""; 
        this.systemPrompt = "Ты эмпатичный собеседник.";
        
        // Настройки по умолчанию
        this.provider = 'openai'; 
        this.model = 'gpt-4o';
        
        this.metrics = { stt_start: 0, stt_end: 0, llm_start: 0, llm_first_byte: 0, tts_start: 0, tts_end: 0 };
    }

    start(config = {}) {
        if (config.systemPrompt) this.systemPrompt = config.systemPrompt;
        if (config.provider) this.provider = config.provider;
        if (config.model) this.model = config.model;

        console.log(`🎤 Live Start: ${this.provider}/${this.model} for user ${this.userId}`);

        this.dgConnection = deepgram.listen.live({
            model: "nova-2", language: "ru", smart_format: true,
            encoding: "linear16", sample_rate: 16000, interim_results: true,
            vad_events: true, endpointing: 300
        });

        this.dgConnection.on(LiveTranscriptionEvents.Open, () => {
            console.log("🟢 STT Stream Started");
            this.metrics.stt_start = Date.now();

            this.dgConnection.on(LiveTranscriptionEvents.Transcript, (data) => {
                const transcript = data.channel.alternatives[0].transcript;
                if (data.is_final && transcript.trim().length > 0) {
                    
                    this.metrics.stt_end = Date.now();
                    this.sendMetric('stt', this.metrics.stt_end - this.metrics.stt_start);
                    this.metrics.stt_start = Date.now();

                    this.socket.emit('user_transcription', { text: transcript, isFinal: true });
                    this.processLLM(transcript);
                } else {
                    if(transcript.trim()) this.socket.emit('user_transcription', { text: transcript, isFinal: false });
                }
            });
        });
        
        this.dgConnection.on(LiveTranscriptionEvents.Error, (err) => console.error(err));
    }

    handleAudioChunk(chunk) {
        if (this.dgConnection && this.dgConnection.getReadyState() === 1) {
            this.dgConnection.send(chunk);
        }
    }

    sendMetric(type, value) {
        this.socket.emit('latency_metric', { type, value });
    }

    // Выбор клиента (Важно для скорости)
    getLlmClient() {
        if (this.provider === 'deepseek') {
            return new OpenAI({ apiKey: process.env.DEEPSEEK_API_KEY, baseURL: 'https://api.deepseek.com' });
        }
        if (this.provider === 'grok') {
            return new OpenAI({ apiKey: process.env.XAI_API_KEY, baseURL: 'https://api.x.ai/v1' });
        }
        if (this.provider === 'groq') {
            return new OpenAI({ apiKey: process.env.GROQ_API_KEY, baseURL: 'https://api.groq.com/openai/v1' });
        }
        return openaiBase;
    }

    async processLLM(text) {
        if (this.isProcessing) return;
        this.isProcessing = true;
        this.metrics.llm_start = Date.now();

        try {
            await saveMessage(this.userId, text, false);
            const history = await fetchHistory(this.userId);
            const username = await getUserName(this.userId);
            
            const enhancedPrompt = `${this.systemPrompt}\n\n[CONTEXT]\nUser Name: ${username}`;
            
            // Чистое сообщение пользователя (без скрытых инструкций)
            const userContent = text;

            const messages = [
                { role: "system", content: enhancedPrompt },
                ...history,
                { role: "user", content: userContent }
            ];

            const client = this.getLlmClient();

            // Google пока скипаем в live
            if (this.provider === 'google') {
                this.socket.emit('ai_text_chunk', { text: "[Google Gemini Live not supported, switch to Groq/Grok/OpenAI]" });
                this.isProcessing = false;
                return;
            }

            const stream = await client.chat.completions.create({
                model: this.model, 
                messages: messages, 
                stream: true,
            });

            this.sentenceBuffer = "";
            let fullResponse = "";
            let firstByteReceived = false;

            for await (const chunk of stream) {
                const content = chunk.choices[0]?.delta?.content || "";
                if (!content) continue;

                if (!firstByteReceived) {
                    this.metrics.llm_first_byte = Date.now();
                    this.sendMetric('llm', this.metrics.llm_first_byte - this.metrics.llm_start);
                    firstByteReceived = true;
                }

                this.socket.emit('ai_text_chunk', { text: content });
                this.sentenceBuffer += content;
                fullResponse += content;

                if (this.shouldSpeak(content)) {
                    const textToSpeak = this.sentenceBuffer.trim();
                    if (textToSpeak.length > 2) {
                        await this.generateAndSendAudio(textToSpeak);
                        this.sentenceBuffer = "";
                    }
                }
            }

            if (this.sentenceBuffer.trim().length > 0) {
                await this.generateAndSendAudio(this.sentenceBuffer);
            }
            
            await saveMessage(this.userId, fullResponse, true);
            this.socket.emit('ai_response_complete');

        } catch (error) {
            console.error("LLM Error:", error);
            this.socket.emit('ai_text_chunk', { text: ` Error: ${error.message}` });
        } finally {
            this.isProcessing = false;
        }
    }

    shouldSpeak(chunk) { return ['.', '!', '?', '\n'].some(punct => chunk.includes(punct)); }

    async generateAndSendAudio(text) {
        try {
            this.metrics.tts_start = Date.now();
            const mp3 = await openaiBase.audio.speech.create({
                model: "tts-1", voice: "shimmer", input: text, response_format: "mp3",
            });
            const buffer = Buffer.from(await mp3.arrayBuffer());
            
            this.metrics.tts_end = Date.now();
            this.sendMetric('tts', this.metrics.tts_end - this.metrics.tts_start);

            this.socket.emit('ai_audio_chunk', buffer);
        } catch (e) { console.error("TTS Error:", e); }
    }

    stop() {
        if (this.dgConnection) {
            this.dgConnection.finish();
            this.dgConnection = null;
        }
    }
}

const sessions = new Map();

module.exports = {
    handleStreamConnection: (socket) => {
        socket.on('start_voice_chat', (config) => {
            const session = new AiStreamSession(socket, socket.userId);
            sessions.set(socket.id, session);
            session.start(config);
        });

        socket.on('audio_stream_data', (chunk) => {
            const session = sessions.get(socket.id);
            if (session) session.handleAudioChunk(chunk);
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
