// services/transcription-service.js
// Using native Node.js modules (Node 18+)
const fs = require('fs');
const { Blob } = require('buffer');

/**
 * Transcribe audio using OpenAI Whisper API
 * Supports 99 languages with automatic language detection
 * 
 * @param {Buffer} audioBuffer - Audio file buffer
 * @param {string} filename - Original filename (e.g., 'audio.webm')
 * @returns {Promise<{text: string, language: string}>} - Transcribed text and detected language
 */
async function transcribeAudio(audioBuffer, filename = 'audio.webm') {
    const apiKey = process.env.OPENAI_API_KEY;

    if (!apiKey) {
        throw new Error('OPENAI_API_KEY not configured');
    }

    try {
        // Create form data with audio file
        const formData = new FormData();

        // Convert buffer to Blob for native FormData
        const blob = new Blob([audioBuffer], { type: 'audio/webm' });
        formData.append('file', blob, filename);

        formData.append('model', 'whisper-1');

        console.log('🎙️ Sending audio to OpenAI Whisper for transcription...');

        const response = await fetch('https://api.openai.com/v1/audio/transcriptions', {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${apiKey}`,
                // Native fetch automatically sets Content-Type for FormData
            },
            body: formData
        });

        if (!response.ok) {
            const error = await response.json();
            console.error('❌ Whisper API error:', error);
            throw new Error(`Whisper API error: ${error.error?.message || response.statusText}`);
        }

        const result = await response.json();

        console.log('✅ Transcription successful:', result.text.substring(0, 100) + '...');

        return {
            text: result.text,
            language: result.language || 'unknown'
        };

    } catch (error) {
        console.error('❌ Transcription error:', error);
        throw error;
    }
}

module.exports = {
    transcribeAudio
};
