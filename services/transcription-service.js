// services/transcription-service.js
// Локальный STT через faster-whisper-server (OpenAI-совместимый endpoint).
// Поддерживает русский, узбекский и ещё ~97 языков (модель large-v3).

const WHISPER_URL = process.env.WHISPER_URL || 'http://127.0.0.1:8000';
const WHISPER_MODEL = process.env.WHISPER_MODEL || 'large-v3';
// Если язык не указан — Whisper сам определит (автодетект).
// Поддерживаемые для нашего кейса: 'ru', 'uz', 'en'.
const WHISPER_DEFAULT_LANG = process.env.WHISPER_DEFAULT_LANG || '';

async function transcribeAudio(audioBuffer, filename = 'voice.webm', language = null) {
    if (!audioBuffer || audioBuffer.length < 1000) {
        console.warn('⚠️ Аудио слишком маленькое, пропускаем STT');
        return { text: '', language: language || WHISPER_DEFAULT_LANG || 'ru' };
    }

    try {
        const form = new FormData();
        // Node 18+ имеет FormData и Blob встроенные
        const blob = new Blob([audioBuffer], { type: guessMime(filename) });
        form.append('file', blob, filename);
        form.append('model', WHISPER_MODEL);
        form.append('response_format', 'json');

        const lang = language || WHISPER_DEFAULT_LANG;
        if (lang) form.append('language', lang);

        const res = await fetch(`${WHISPER_URL}/v1/audio/transcriptions`, {
            method: 'POST',
            body: form
        });

        if (!res.ok) {
            const txt = await res.text();
            throw new Error(`Whisper HTTP ${res.status}: ${txt.slice(0, 200)}`);
        }

        const data = await res.json();
        return {
            text: data.text || '',
            language: data.language || lang || 'ru'
        };
    } catch (err) {
        console.error('❌ STT error:', err.message);
        throw new Error(`STT failed: ${err.message}`);
    }
}

function guessMime(filename) {
    const ext = filename.split('.').pop().toLowerCase();
    const map = {
        webm: 'audio/webm',
        wav: 'audio/wav',
        mp3: 'audio/mpeg',
        ogg: 'audio/ogg',
        m4a: 'audio/mp4',
        opus: 'audio/opus',
        flac: 'audio/flac'
    };
    return map[ext] || 'audio/webm';
}

module.exports = { transcribeAudio, WHISPER_URL, WHISPER_MODEL };
