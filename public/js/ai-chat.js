// public/js/ai-chat.js
import { showError, showSuccess, showInfo } from './ui.js';

let availableProviders = [];
let availableModels = {};

// Глобальные функции AI чата
window.testAIChat = async function() {
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

    if (useStreaming) {
        await testAIChatStream(psychotype, provider, model, message);
    } else {
        await testAIChatRegular(psychotype, provider, model, message);
    }
};

window.loadProviders = async function() {
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

window.loadModels = function() {
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
    const streamIndicator = document.getElementById('streamIndicator');
    const chatResult = document.getElementById('chatResult');
    
    if (typingIndicator) typingIndicator.style.display = 'block';
    if (streamIndicator) streamIndicator.style.display = 'none';
    if (chatResult) chatResult.innerHTML = '';
    
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
            displayRegularResult(data, clientTime);
            showSuccess('Ответ получен!');
        } else {
            if (chatResult) {
                chatResult.innerHTML = `<div class="result error">❌ Ошибка: ${data.error}</div>`;
            }
            showError('Ошибка AI: ' + data.error);
        }
            
    } catch (error) {
        console.error('❌ Ошибка AI чата:', error);
        if (typingIndicator) typingIndicator.style.display = 'none';
        if (chatResult) {
            chatResult.innerHTML = `<div class="result error">❌ Ошибка: ${error.message}</div>`;
        }
        showError('Ошибка соединения: ' + error.message);
    }
}

async function testAIChatStream(psychotype, provider, model, message) {
    const typingIndicator = document.getElementById('typingIndicator');
    const streamIndicator = document.getElementById('streamIndicator');
    const chatResult = document.getElementById('chatResult');
    
    if (typingIndicator) typingIndicator.style.display = 'none';
    if (streamIndicator) streamIndicator.style.display = 'block';
    if (chatResult) {
        chatResult.innerHTML = 
            '<div class="result streaming-active" id="streamResult"><strong>💭 Ответ:</strong> <span id="streamText"></span></div>';
    }
    
    const streamStartTime = Date.now();
    const streamText = document.getElementById('streamText');
    
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
            if (streamText) streamText.textContent = fullResponse;
            
            if (streamText) streamText.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        }
        
        const streamEndTime = Date.now();
        const streamTime = streamEndTime - streamStartTime;
        
        const timingHTML = `
            <div class="timing">
                <strong>⏱️ Время потоковой передачи:</strong>
                <div class="timing-grid">
                    <div class="timing-item">
                        <div class="timing-value">${streamTime}ms</div>
                        <div>Общее время</div>
                    </div>
                </div>
            </div>
        `;
        
        const streamResult = document.getElementById('streamResult');
        if (streamResult) streamResult.innerHTML += timingHTML;
        
        showSuccess('Потоковый ответ завершен!');
        
    } catch (error) {
        console.error('❌ Ошибка потоковой передачи:', error);
        if (chatResult) {
            chatResult.innerHTML = `<div class="result error">❌ Ошибка потоковой передачи: ${error.message}</div>`;
        }
        showError('Ошибка потоковой передачи: ' + error.message);
    } finally {
        if (streamIndicator) streamIndicator.style.display = 'none';
    }
}

function displayRegularResult(data, clientTime) {
    const chatResult = document.getElementById('chatResult');
    if (!chatResult) return;
    
    let resultHTML = `
        <div class="result success">
            <div style="margin-bottom: 15px;">
                <strong>💭 Ответ:</strong> ${data.response}
            </div>
            <div style="color: #666; font-size: 14px;">
                <span class="psychotype-badge">${data.psychotype}</span>
                <span class="provider-badge">${data.provider}</span>
                <span class="model-badge">${data.model}</span>
            </div>
        </div>
    `;
    
    if (data.timing) {
        resultHTML += `
            <div class="timing">
                <strong>⏱️ Время ответа:</strong>
                <div class="timing-grid">
                    <div class="timing-item">
                        <div class="timing-value">${data.timing.api_response_time || 'N/A'}ms</div>
                        <div>API</div>
                    </div>
                    <div class="timing-item">
                        <div class="timing-value">${data.timing.total_time || 'N/A'}ms</div>
                        <div>Сервер</div>
                    </div>
                    <div class="timing-item">
                        <div class="timing-value">${clientTime}ms</div>
                        <div>Клиент</div>
                    </div>
                </div>
            </div>
        `;
    }
    
    chatResult.innerHTML = resultHTML;
}

// Автоматически загружаем провайдеры при загрузке страницы
document.addEventListener('DOMContentLoaded', function() {
    setTimeout(() => {
        if (window.currentToken) {
            window.loadProviders();
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
        console.error('❌ Ошибка загрузки провайдеров:', error);
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