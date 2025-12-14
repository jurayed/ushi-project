// services/transcription-service.js
// Работает на Node 18+ (встроенный fetch и FormData)

async function transcribeAudio(audioBuffer, filename = 'voice.webm') {
    if (!process.env.OPENAI_API_KEY) {
        throw new Error('OPENAI_API_KEY не найден в .env файле');
    }

    try {
        console.log(`🎙️ Начало транскрибации (${filename}, ${audioBuffer.length} байт)...`);

        const formData = new FormData();
        // Важно: создаем Blob с правильным типом
        const blob = new Blob([audioBuffer], { type: 'audio/webm' });
        formData.append('file', blob, filename);
        formData.append('model', 'whisper-1');

        const response = await fetch('https://api.openai.com/v1/audio/transcriptions', {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`
                // Content-Type устанавливается автоматически браузером/node fetch
            },
            body: formData
        });

        if (!response.ok) {
            const errorData = await response.json().catch(() => ({}));
            console.error('❌ Ошибка OpenAI Whisper:', JSON.stringify(errorData, null, 2));
            throw new Error(`Whisper API Error: ${errorData.error?.message || response.statusText}`);
        }

        const result = await response.json();
        console.log('✅ Транскрибация успешна:', result.text.substring(0, 50) + '...');
        
        return {
            text: result.text,
            language: result.language || 'unknown'
        };

    } catch (error) {
        console.error('❌ Критическая ошибка транскрибации:', error.message);
        throw error;
    }
}

module.exports = { transcribeAudio };
