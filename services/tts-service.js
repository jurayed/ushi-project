// services/tts-service.js
// Локальный TTS через HTTP. По-умолчанию — Piper HTTP-server.
// Узбекский локально найти сложно → fallback на Piper turkish voice (фонетически близкий).
//
// ENV:
//   TTS_URL          — базовый URL TTS сервера (Piper по-умолчанию: http://127.0.0.1:5000)
//   TTS_VOICE_RU     — имя голоса для русского (например: ru_RU-irina-medium)
//   TTS_VOICE_UZ     — имя голоса для узбекского (fallback: tr_TR-dfki-medium)
//   TTS_VOICE_EN     — имя голоса для английского (например: en_US-lessac-medium)
//   TTS_ENGINE       — 'piper' (default) | 'openai-compatible' (для XTTS/custom)

const fs = require('fs');
const path = require('path');

const TTS_URL = process.env.TTS_URL || 'http://127.0.0.1:5000';
const TTS_ENGINE = process.env.TTS_ENGINE || 'piper';
const TTS_VOICE_RU = process.env.TTS_VOICE_RU || 'ru_RU-irina-medium';
const TTS_VOICE_UZ = process.env.TTS_VOICE_UZ || 'tr_TR-dfki-medium';
const TTS_VOICE_EN = process.env.TTS_VOICE_EN || 'en_US-lessac-medium';

const UPLOAD_DIR = path.join(__dirname, '../public/uploads/voice');
if (!fs.existsSync(UPLOAD_DIR)) fs.mkdirSync(UPLOAD_DIR, { recursive: true });

// Простой эвристический детектор языка: кириллица → ru, латиница с узб. буквами (ʻoʻgʻ, sh, ch, x, q) → uz
function detectLanguage(text) {
    if (!text) return 'ru';
    const hasCyrillic = /[Ѐ-ӿ]/.test(text);
    if (hasCyrillic) return 'ru';

    // Характерные узбекские диграфы и буквы — если латиница и эти встречаются → uz
    const uzMarkers = /\b(o['ʻ`]|g['ʻ`]|sh|ch|q|x|ng)\b|[ʻʼ]/i;
    const latinLetters = /[a-z]/i.test(text);
    if (latinLetters && uzMarkers.test(text)) return 'uz';
    if (latinLetters) return 'en';
    return 'ru';
}

function pickVoice(lang) {
    switch (lang) {
        case 'ru': return TTS_VOICE_RU;
        case 'uz': return TTS_VOICE_UZ;
        case 'en': return TTS_VOICE_EN;
        default:   return TTS_VOICE_RU;
    }
}

async function piperSynthesize(text, voice) {
    // Piper HTTP сервер (rhasspy/piper-http или wyoming-piper с REST-обёрткой):
    //   POST /api/tts  body: { text, voice } -> audio/wav
    // Так же поддерживаем альтернативный формат: query-string
    const res = await fetch(`${TTS_URL}/api/tts`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text, voice })
    });
    if (!res.ok) {
        const txt = await res.text().catch(() => '');
        throw new Error(`Piper HTTP ${res.status}: ${txt.slice(0, 200)}`);
    }
    return Buffer.from(await res.arrayBuffer());
}

async function openaiCompatibleSynthesize(text, voice) {
    // Для XTTS-v2 или Coqui/Custom с OpenAI-совместимым /v1/audio/speech
    const res = await fetch(`${TTS_URL}/v1/audio/speech`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            model: 'tts-1',
            input: text,
            voice: voice,
            response_format: 'mp3'
        })
    });
    if (!res.ok) {
        const txt = await res.text().catch(() => '');
        throw new Error(`TTS HTTP ${res.status}: ${txt.slice(0, 200)}`);
    }
    return Buffer.from(await res.arrayBuffer());
}

async function synthesizeToBuffer(text, opts = {}) {
    const lang = opts.language || detectLanguage(text);
    const voice = opts.voice || pickVoice(lang);

    if (TTS_ENGINE === 'openai-compatible') {
        return { buffer: await openaiCompatibleSynthesize(text, voice), lang, voice, ext: 'mp3' };
    }
    return { buffer: await piperSynthesize(text, voice), lang, voice, ext: 'wav' };
}

async function generateSpeech(text, filenamePrefix, opts = {}) {
    if (!text || !text.trim()) return null;
    try {
        const start = Date.now();
        const { buffer, lang, voice, ext } = await synthesizeToBuffer(text, opts);
        const duration = Date.now() - start;

        const filename = `${filenamePrefix}-${lang}.${ext}`;
        const filePath = path.join(UPLOAD_DIR, filename);
        fs.writeFileSync(filePath, buffer);

        return {
            url: `/uploads/voice/${filename}`,
            duration_ms: duration,
            filename,
            language: lang,
            voice
        };
    } catch (err) {
        console.error('TTS Error:', err.message);
        return null;
    }
}

module.exports = {
    generateSpeech,
    synthesizeToBuffer,
    detectLanguage,
    TTS_URL,
    TTS_ENGINE
};
