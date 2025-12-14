// services/transcription-service.js
const { OpenAI, toFile } = require('openai');
const path = require('path');

const openai = new OpenAI();

async function transcribeAudio(audioBuffer, filename = 'voice.webm') {
    if (!process.env.OPENAI_API_KEY) {
        throw new Error('OPENAI_API_KEY не найден в .env');
    }

    // Предварительная проверка размера буфера (меньше 1КБ — скорее всего тишина или заголовок)
    if (audioBuffer.length < 1000) {
        console.warn('⚠️ Аудиофайл слишком маленький, пропускаем запрос к OpenAI');
        return { text: "...", language: "ru" }; // Возвращаем заглушку
    }

    try {
        console.log(`🎙️ Транскрибация (${audioBuffer.length} байт)...`);

        const file = await toFile(audioBuffer, filename, { type: 'audio/webm' });

        const response = await openai.audio.transcriptions.create({
            file: file,
            model: "whisper-1",
            language: "ru",
        });

        console.log('✅ Успех:', response.text.substring(0, 30));
        
        return {
            text: response.text,
            language: response.language || 'ru'
        };

    } catch (error) {
        // Если OpenAI ругается на короткий файл - не считаем это критической ошибкой
        if (error.message && error.message.includes('too short')) {
            console.warn('⚠️ OpenAI: Аудио слишком короткое.');
            return { text: "", language: "ru" };
        }

        console.error('❌ Ошибка OpenAI Whisper:', error.message);
        throw new Error(`Ошибка распознавания: ${error.message}`);
    }
}

module.exports = { transcribeAudio };
