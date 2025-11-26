// Updated send Audio Message function with transcription
// This replaces the sendAudioMessage function in ai-chat.js

// Helper functions for UI notifications
function showInfo(message) {
    const toast = document.createElement('div');
    toast.className = 'toast toast-info';
    toast.textContent = message;
    document.body.appendChild(toast);
    setTimeout(() => toast.remove(), 3000);
}

function showError(message) {
    const toast = document.createElement('div');
    toast.className = 'toast toast-error';
    toast.textContent = message;
    document.body.appendChild(toast);
    setTimeout(() => toast.remove(), 3000);
}

function showSuccess(message) {
    const toast = document.createElement('div');
    toast.className = 'toast toast-success';
    toast.textContent = message;
    document.body.appendChild(toast);
    setTimeout(() => toast.remove(), 3000);
}

window.sendAudioMessageWithTranscription = async function (audioBlob) {
    const formData = new FormData();
    formData.append('audio', audioBlob, 'voice-message.webm');

    try {
        showInfo('Отправка голосового сообщения...');

        // 1. Upload and transcribe audio using Whisper
        console.log('🎙️ Transcribing audio with Whisper...');
        showInfo('Транскрибируется...');

        const transcribeResponse = await fetch('/api/upload/transcribe', {
            method: 'POST',
            headers: {
                'Authorization': 'Bearer ' + window.currentToken
            },
            body: formData
        });

        if (!transcribeResponse.ok) {
            throw new Error('Ошибка транскрибации аудио');
        }

        const transcribeResult = await transcribeResponse.json();
        const audioUrl = transcribeResult.url;
        const transcribedText = transcribeResult.text;
        const detectedLanguage = transcribeResult.language;

        console.log(`✅ Transcribed (${detectedLanguage}): ${transcribedText.substring(0, 100)}...`);

        // 2. Send message with both audio URL and transcribed text to AI chat API
        const psychotype = document.getElementById('psychotype')?.value;
        const provider = document.getElementById('provider')?.value;
        const model = document.getElementById('model')?.value;
        const useStreaming = document.getElementById('useStreaming')?.checked;

        showInfo('Отправка ИИ...');

        const payload = {
            message: transcribedText,  // AI processes the transcribed text
            psychotype,
            provider,
            model,
            media_url: audioUrl,  // Save audio URL for display
            media_type: 'audio/webm',
            transcribed_text: transcribedText  // Save transcription
        };

        // First, display the user's message with audio in the UI
        if (window.appendMessage) {
            window.appendMessage('user', transcribedText, {
                media_url: audioUrl,
                media_type: 'audio/webm'
            });
        }

        // Then send to AI
        if (useStreaming && window.testAIChatStream) {
            await window.testAIChatStream(
                payload.psychotype,
                payload.provider,
                payload.model,
                payload.message
            );
        } else {
            const chatResponse = await fetch('/api/chat/ai', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': 'Bearer ' + window.currentToken
                },
                body: JSON.stringify(payload)
            });

            if (!chatResponse.ok) {
                throw new Error('Ошибка отправки сообщения ИИ');
            }

            const chatResult = await chatResponse.json();

            // Display AI response
            if (window.appendMessage) {
                window.appendMessage('ai', chatResult.response, {
                    psychotype: chatResult.psychotype,
                    provider: chatResult.provider,
                    model: chatResult.model
                });
            }
        }

        showSuccess(`Отправлено! (${detectedLanguage})`);

    } catch (error) {
        console.error('❌ Error sending audio message:', error);
        showError('Ошибка: ' + error.message);
    }
};

// Add this to the bottom of chat-enhancements.js to override
console.log('✅ Audio transcription loaded');
