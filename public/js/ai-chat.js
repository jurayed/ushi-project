import { showError, showSuccess, showInfo } from './ui.js';

let availableProviders = [];
let availableModels = {};

// ====================VOICE MESSAGE GLOBALS ====================
let mediaRecorder = null;
let audioChunks = [];

// Глобальные функции AI чата
window.testAIChat = async function () {
    if (!window.currentToken) {
        showError('Сначала войдите в систему');
        return;
    }

    const psychotype = document.getElementById('psychotype')?.value;
    const provider = document.getElementById('provider')?.value;
    const model = document.getElementById('model')?.value;
    const message = document.getElementById('messageInput')?.value.trim();
    const useStreaming = document.getElementById('useStreaming')?.checked;

    if (!message) {
        showError('Пожалуйста, введите сообщение');
        return;
    }

    if (!provider || !model) {
        showError('Выберите провайдера и модель');
        return;
    }

    // Очищаем поле ввода после отправки
    document.getElementById('messageInput').value = '';

    // Отображаем сообщение пользователя сразу
    appendMessage('user', message);

    if (useStreaming) {
        await testAIChatStream(psychotype, provider, model, message);
    } else {
        await testAIChatRegular(psychotype, provider, model, message);
    }
};

window.loadProviders = async function () {
    try {
        console.log('🔄 Загрузка провайдеров...');

        showInfo('Загрузка списка провайдеров...');

        const response = await fetch('/api/providers');

        if (!response.ok) {
            throw new Error(`HTTP ошибка! статус: ${response.status}`);
        }

        availableProviders = await response.json();

        const providerSelect = document.getElementById('provider');
        if (!providerSelect) {
            console.warn('Элемент provider не найден');
            return;
        }

        providerSelect.innerHTML = '<option value="">Выберите провайдера</option>';

        let enabledCount = 0;
        availableProviders.forEach(provider => {
            const option = document.createElement('option');
            option.value = provider.id;
            option.textContent = `${provider.name} ${provider.enabled ? '✅' : '❌'}`;
            option.disabled = !provider.enabled;
            providerSelect.appendChild(option);

            if (provider.enabled) {
                availableModels[provider.id] = provider.models;
                enabledCount++;
            }
        });

        // Автоматически выбираем первый доступный провайдер
        const firstEnabledProvider = availableProviders.find(p => p.enabled);
        if (firstEnabledProvider) {
            providerSelect.value = firstEnabledProvider.id;
            loadModels();
        }

        console.log('✅ Провайдеры загружены:', availableProviders);
        showSuccess(`Загружено ${availableProviders.length} провайдеров (${enabledCount} доступно)`);

    } catch (error) {
        console.error('❌ Ошибка загрузки провайдеров:', error);
        showError('Не удалось загрузить список провайдеров: ' + error.message);

        // Показываем fallback провайдеры при ошибке
        showFallbackProviders();
    }
};

window.loadModels = function () {
    const provider = document.getElementById('provider')?.value;
    const modelSelect = document.getElementById('model');

    if (!modelSelect || !provider) {
        console.warn('Элемент model или provider не найден');
        return;
    }

    modelSelect.innerHTML = '<option value="">Выберите модель</option>';

    if (availableModels[provider]) {
        Object.entries(availableModels[provider]).forEach(([modelKey, modelInfo]) => {
            const option = document.createElement('option');
            option.value = modelKey;
            option.textContent = `${modelInfo.name} (${modelInfo.context} tokens) - ${modelInfo.price || 'цена не указана'}`;
            modelSelect.appendChild(option);
        });

        // Автоматически выбираем первую модель
        const firstModel = Object.keys(availableModels[provider])[0];
        if (firstModel) {
            modelSelect.value = firstModel;
        }

        console.log(`✅ Модели загружены для ${provider}:`, Object.keys(availableModels[provider]));
    } else {
        console.warn('Модели не найдены для провайдера:', provider);
        showError('Модели не найдены для выбранного провайдера');
    }
};

// Загрузка истории чата
window.loadChatHistory = async function () {
    try {
        const response = await fetch('/api/chat/ai/history', {
            headers: {
                'Authorization': 'Bearer ' + window.currentToken
            }
        });

        if (!response.ok) {
            throw new Error('Ошибка загрузки истории');
        }

        const messages = await response.json();
        const container = document.getElementById('aiChatContainer');
        if (container) {
            container.innerHTML = ''; // Очищаем контейнер
            messages.forEach(msg => {
                appendMessage(
                    msg.is_ai_response ? 'ai' : 'user',
                    msg.message_text,
                    msg.is_ai_response
                        ? { psychotype: msg.ai_psychotype, media_url: msg.media_url, media_type: msg.media_type }
                        : { media_url: msg.media_url, media_type: msg.media_type }
                );
            });
            // Прокрутка вниз
            container.scrollTop = container.scrollHeight;
        }
    } catch (error) {
        console.error('Ошибка загрузки истории:', error);
    }
};

// Вспомогательная функция для добавления сообщения
function appendMessage(role, text, metadata = null) {
    const container = document.getElementById('aiChatContainer');
    if (!container) return null;

    const messageDiv = document.createElement('div');
    messageDiv.className = `message ${role === 'user' ? 'sent' : 'received'}`;

    let content = '';

    // Если есть медиа (аудио)
    if (metadata && metadata.media_url && metadata.media_type === 'audio/webm') {
        content += `
            <div class="audio-message">
                <audio controls src="${metadata.media_url}"></audio>
            </div>
        `;
    }

    if (text) {
        content += `<div class="message-content">${text}</div>`;
    }

    if (role === 'ai' && metadata) {
        content += `
            <div class="message-meta" style="font-size: 0.8em; color: #888; margin-top: 5px;">
                ${metadata.psychotype || 'AI'} ${metadata.provider ? `(${metadata.provider})` : ''}
            </div>
        `;
    }

    messageDiv.innerHTML = content;
    container.appendChild(messageDiv);
    container.scrollTop = container.scrollHeight;

    return messageDiv; // Возвращаем элемент для обновления
}

// ==================== VOICE MESSAGE FUNCTIONS ====================
window.startAudioMessage = async function () {
    try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        mediaRecorder = new MediaRecorder(stream);
        audioChunks = [];

        mediaRecorder.ondataavailable = event => {
            audioChunks.push(event.data);
        };

        mediaRecorder.onstop = async () => {
            const audioBlob = new Blob(audioChunks, { type: 'audio/webm' });
            await sendAudioMessage(audioBlob);
        };

        mediaRecorder.start();

        // UI updates
        const recordBtn = document.getElementById('recordButton');
        const stopBtn = document.getElementById('stopRecordButton');
        const cancelBtn = document.getElementById('cancelRecordButton');

        if (recordBtn) recordBtn.style.display = 'none';
        if (stopBtn) stopBtn.style.display = 'inline-block';
        if (cancelBtn) cancelBtn.style.display = 'inline-block';

        showInfo('Запись пошла...');
    } catch (error) {
        console.error('Ошибка доступа к микрофону:', error);
        showError('Не удалось получить доступ к микрофону');
    }
};

window.stopAudioMessage = function () {
    if (mediaRecorder && mediaRecorder.state !== 'inactive') {
        mediaRecorder.stop();
        // UI updates
        const recordBtn = document.getElementById('recordButton');
        const stopBtn = document.getElementById('stopRecordButton');
        const cancelBtn = document.getElementById('cancelRecordButton');

        if (recordBtn) recordBtn.style.display = 'inline-block';
        if (stopBtn) stopBtn.style.display = 'none';
        if (cancelBtn) cancelBtn.style.display = 'none';
    }
};

window.cancelAudioMessage = function () {
    if (mediaRecorder && mediaRecorder.state !== 'inactive') {
        // Stop but don't process
        mediaRecorder.onstop = null;
        mediaRecorder.stop();
        audioChunks = [];

        // UI updates
        const recordBtn = document.getElementById('recordButton');
        const stopBtn = document.getElementById('stopRecordButton');
        const cancelBtn = document.getElementById('cancelRecordButton');

        if (recordBtn) recordBtn.style.display = 'inline-block';
        if (stopBtn) stopBtn.style.display = 'none';
        if (cancelBtn) cancelBtn.style.display = 'none';

        showInfo('Запись отменена');
    }
};

async function sendAudioMessage(audioBlob) {
    const formData = new FormData();
    formData.append('audio', audioBlob, 'voice-message.webm');

    try {
        showInfo('Отправка голосового сообщения...');

        // 1. Upload audio
        const uploadResponse = await fetch('/api/upload/audio', {
            method: 'POST',
            headers: {
                'Authorization': 'Bearer ' + window.currentToken
            },
            body: formData
        });

        if (!uploadResponse.ok) {
            throw new Error('Ошибка загрузки аудио');
        }

        const uploadResult = await uploadResponse.json();
        const audioUrl = uploadResult.url;

        // 2. Send message with audio URL to chat API
        const psychotype = document.getElementById('psychotype')?.value;
        const provider = document.getElementById('provider')?.value;
        const model = document.getElementById('model')?.value;

        // Отображаем сразу
        appendMessage('user', '', { media_url: audioUrl, media_type: 'audio/webm' });

        const chatResponse = await fetch('/api/chat/ai', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': 'Bearer ' + window.currentToken
            },
            body: JSON.stringify({
                message: '[Голосовое сообщение]',
                psychotype: psychotype,
                provider: provider,
                model: model,
                media_url: audioUrl,
                media_type: 'audio/webm'
            })
        });

        if (!chatResponse.ok) {
            throw new Error('Ошибка отправки сообщения в чат');
        }

        const chatData = await chatResponse.json();

        if (chatData.success) {
            appendMessage('ai', chatData.response, {
                psychotype: chatData.psychotype,
                provider: chatData.provider,
                model: chatData.model
            });
            showSuccess('Голосовое сообщение отправлено!');
        } else {
            showError('Ошибка AI: ' + chatData.error);
        }

    } catch (error) {
        console.error('Ошибка отправки голосового:', error);
        showError('Ошибка: ' + error.message);
    }
}

// Fallback провайдеры при ошибке загрузки
function showFallbackProviders() {
    const providerSelect = document.getElementById('provider');
    if (!providerSelect) return;

    providerSelect.innerHTML = `
        <option value="deepseek">DeepSeek ✅</option>
        <option value="openai">OpenAI ✅</option>
        <option value="gemini">Google Gemini ✅</option>
    `;

    const modelSelect = document.getElementById('model');
    if (modelSelect) {
        modelSelect.innerHTML = `
            <option value="deepseek-chat">DeepSeek Chat (32768 tokens) - $0.14/1M input</option>
            <option value="gpt-4-turbo-preview">GPT-4 Turbo (128000 tokens) - $10/1M input</option>
            <option value="gemini-2.0-flash">Gemini 2.0 Flash (1000000 tokens) - Бесплатно (быстрая)</option>
        `;
    }

    console.log('🔄 Используются fallback провайдеры');
    showInfo('Используются резервные настройки провайдеров');
}

// Внутренние функции
async function testAIChatRegular(psychotype, provider, model, message) {
    const typingIndicator = document.getElementById('typingIndicator');

    if (typingIndicator) typingIndicator.style.display = 'block';

    const clientStartTime = Date.now();

    try {
        console.log('📤 Отправка запроса к AI...', { psychotype, provider, model, message });

        const response = await fetch('/api/chat/ai', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': 'Bearer ' + window.currentToken
            },
            body: JSON.stringify({
                message: message,
                psychotype: psychotype,
                provider: provider,
                model: model
            })
        });

        const clientEndTime = Date.now();
        const clientTime = clientEndTime - clientStartTime;

        if (!response.ok) {
            const errorData = await response.json().catch(() => ({}));
            throw new Error(errorData.error || `HTTP ошибка! статус: ${response.status}`);
        }

        const data = await response.json();

        if (typingIndicator) typingIndicator.style.display = 'none';

        if (data.success) {
            appendMessage('ai', data.response, {
                psychotype: data.psychotype,
                provider: data.provider,
                model: data.model
            });
            showSuccess('Ответ получен!');
        } else {
            showError('Ошибка AI: ' + data.error);
        }

    } catch (error) {
        console.error('❌ Ошибка AI чата:', error);
        if (typingIndicator) typingIndicator.style.display = 'none';
        showError('Ошибка соединения: ' + error.message);
    }
}

async function testAIChatStream(psychotype, provider, model, message) {
    const typingIndicator = document.getElementById('typingIndicator');
    const streamIndicator = document.getElementById('streamIndicator');

    if (typingIndicator) typingIndicator.style.display = 'none';
    if (streamIndicator) streamIndicator.style.display = 'block';

    // Создаем пустой элемент сообщения для стриминга
    const messageDiv = appendMessage('ai', '...', { psychotype, provider });
    if (!messageDiv) {
        showError('Контейнер чата не найден');
        if (streamIndicator) streamIndicator.style.display = 'none';
        return;
    }
    const contentDiv = messageDiv.querySelector('.message-content');

    const streamStartTime = Date.now();

    try {
        console.log('📤 Отправка потокового запроса к AI...', { psychotype, provider, model, message });

        const response = await fetch('/api/chat/ai/stream', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': 'Bearer ' + window.currentToken
            },
            body: JSON.stringify({
                message: message,
                psychotype: psychotype,
                provider: provider,
                model: model
            })
        });

        if (!response.ok) {
            const errorData = await response.json().catch(() => ({}));
            throw new Error(errorData.error || `HTTP ошибка! статус: ${response.status}`);
        }

        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let fullResponse = '';

        while (true) {
            const { done, value } = await reader.read();
            if (done) break;

            const chunk = decoder.decode(value);
            fullResponse += chunk;

            // Обновляем содержимое сообщения
            if (contentDiv) contentDiv.textContent = fullResponse;

            // Прокрутка
            const container = document.getElementById('aiChatContainer');
            if (container) container.scrollTop = container.scrollHeight;
        }

        showSuccess('Потоковый ответ завершен!');

    } catch (error) {
        console.error('❌ Ошибка потоковой передачи:', error);
        if (contentDiv) contentDiv.innerHTML += `<br><span style="color:red">❌ Ошибка: ${error.message}</span>`;
        showError('Ошибка потоковой передачи: ' + error.message);
    } finally {
        if (streamIndicator) streamIndicator.style.display = 'none';
    }
}

// Автоматически загружаем провайдеры при загрузке страницы
document.addEventListener('DOMContentLoaded', function () {
    setTimeout(() => {
        if (window.currentToken) {
            window.loadProviders();
            window.loadChatHistory(); // Загружаем историю
        }
    }, 1000);
});

// Функция загрузки провайдеров
export async function loadProviders() {
    try {
        console.log('🔄 Загрузка провайдеров...');
        const response = await fetch('/api/providers');
        const providers = await response.json();

        if (!response.ok) {
            throw new Error(providers.error || 'Ошибка загрузки провайдеров');
        }

        const providerSelect = document.getElementById('provider');
        const modelSelect = document.getElementById('model');

        // Очищаем селекты
        providerSelect.innerHTML = '';
        modelSelect.innerHTML = '';

        // Заполняем провайдеры
        providers.forEach(provider => {
            if (provider.enabled) {
                const option = document.createElement('option');
                option.value = provider.id;
                option.textContent = `${provider.name} ${provider.enabled ? '✅' : '❌'}`;
                providerSelect.appendChild(option);
            }
        });

        // Обновляем модели при выборе провайдера
        providerSelect.addEventListener('change', updateModels);

        // Инициализируем модели для первого провайдера
        await updateModels();

        console.log('✅ Провайдеры загружены:', providers);
        return providers;
    } catch (error) {
        console.error('❌ Ошибка загрузки провай деров:', error);
        showError('Не удалось загрузить провайдеры: ' + error.message);
    }
}

async function updateModels() {
    try {
        const providerSelect = document.getElementById('provider');
        const modelSelect = document.getElementById('model');
        const providers = await loadProvidersData();

        const selectedProvider = providers.find(p => p.id === providerSelect.value);

        if (!selectedProvider) return;

        // Очищаем модели
        modelSelect.innerHTML = '';

        // Заполняем модели для выбранного провайдера
        Object.entries(selectedProvider.models).forEach(([modelKey, modelInfo]) => {
            const option = document.createElement('option');
            option.value = modelKey;
            option.textContent = `${modelInfo.name} (${modelInfo.context} tokens)`;
            modelSelect.appendChild(option);
        });

    } catch (error) {
        console.error('❌ Ошибка обновления моделей:', error);
    }
}

async function loadProvidersData() {
    const response = await fetch('/api/providers');
    return await response.json();
}

// Делаем функцию глобальной
window.loadProviders = loadProviders;
// Expose functions for enhancements
window.sendAudioMessage = sendAudioMessage;
window.appendMessage = appendMessage;
window.testAIChatStream = testAIChatStream;
window.testAIChatRegular = testAIChatRegular;
