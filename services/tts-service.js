// services/tts-service.js
const fs = require('fs');
const path = require('path');
// const fetch = require('node-fetch'); // <--- УДАЛИТЬ ЭТУ СТРОКУ, fetch встроен в Node 18+
const { pool } = require('../models/database');

async function generateSpeech(text, filenamePrefix) {
    if (!process.env.OPENAI_API_KEY) return null;

    try {
        const startTime = Date.now();
        
        const response = await fetch('https://api.openai.com/v1/audio/speech', {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                model: 'tts-1',
                input: text,
                voice: 'shimmer'
            })
        });

        if (!response.ok) {
            const err = await response.json();
            throw new Error(err.error?.message || 'TTS API Error');
        }

        const buffer = await response.arrayBuffer();
        const duration = Date.now() - startTime;

        // Сохраняем файл
        const filename = `${filenamePrefix}-ai.mp3`;
        const uploadDir = path.join(__dirname, '../public/uploads/voice');
        if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });
        
        const filePath = path.join(uploadDir, filename);
        fs.writeFileSync(filePath, Buffer.from(buffer));

        return {
            url: `/uploads/voice/${filename}`,
            duration_ms: duration,
            filename: filename
        };

    } catch (error) {
        console.error('TTS Error:', error.message);
        return null; // Возвращаем null, чтобы чат не падал, а просто был без звука
    }
}

module.exports = { generateSpeech };
