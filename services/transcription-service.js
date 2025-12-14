// services/transcription-service.js
const { OpenAI, toFile } = require('openai');
const path = require('path');
const fs = require('fs');

// Инициализация (ключ берется из .env автоматически)
const openai = new OpenAI();

async function transcribeAudio(audioBuffer, filename = 'voice.webm') {
    if (!process.env.OPENAI_API_KEY) {
        throw new Error('OPENAI_API_KEY не найден в .env');
    }

    try {
        console.log(`🎙️ Транскрибация через OpenAI SDK (${audioBuffer.length} байт)...`);

        // OpenAI SDK требует File-like объект. Конвертируем буфер.
        const file = await toFile(audioBuffer, filename, {
            type: 'audio/webm'
        });

        const response = await openai.audio.transcriptions.create({
            file: file,
            model: "whisper-1",
            language: "ru", // Подсказываем язык для точности
        });

        console.log('✅ Успех:', response.text.substring(0, 30) + '...');
        
        return {
            text: response.text,
            language: response.language || 'ru'
        };

    } catch (error) {
        console.error('❌ Ошибка OpenAI Whisper:', error);
        throw new Error(`Ошибка распознавания: ${error.message}`);
    }
}

module.exports = { transcribeAudio };
