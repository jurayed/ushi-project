// public/js/ai-chat.js
import { showError } from './ui.js';

let availableProviders = [];
let availableModels = {};

// Глобальные функции AI чата
window.testAIChat = async function() {
    if (!window.currentToken) {
        alert('Сначала войдите в систему');
        return;
    }

    const psychotype = document.getElementById('psychotype')?.value;
    const provider = document.getElementById('provider')?.value;
    const model = document.getElementById('model')?.value;
    const message = document.getElementById('messageInput')?.value.trim();
    const useStreaming = document.getElementById('useStreaming')?.checked;

    if (!message) {
        alert('Пожалуйста, введите сообщение');
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
        const response = await fetch('/api/providers');
        
        if (!response.ok) {
            throw new Error('Ошибка загрузки провайдеров');
        }
        
        availableProviders = await response.json();
        
        const providerSelect = document.getElementById('provider');
        if (!providerSelect) return;
        
        providerSelect.innerHTML = '';
        
        availableProviders.forEach(provider => {
            const option = document.createElement('option');
            option.value = provider.id;
            option.textContent = `${provider.name} ${provider.enabled ? '✅' : '❌'}`;
            option.disabled = !provider.enabled;
            providerSelect.appendChild(option);
            
            if (provider.enabled) {
                availableModels[provider.id] = provider.models;
            }
        });
        
        loadModels();
        
        console.log('✅ Провайдеры и модели загружены:', availableProviders);
    } catch (error) {
        console.error('❌ Ошибка загрузки провайдеров:', error);
        showError('Не удалось загрузить список провайдеров');
    }
};

window.loadModels = function() {
    const provider = document.getElementById('provider')?.value;
    const modelSelect = document.getElementById('model');
    if (!modelSelect || !provider) return;
    
    modelSelect.innerHTML = '';
    
    if (availableModels[provider]) {
        Object.entries(availableModels[provider]).forEach(([modelKey, modelInfo]) => {
            const option = document.createElement('option');
            option.value = modelKey;
            option.textContent = `${modelInfo.name} (${modelInfo.context} tokens) - ${modelInfo.price}`;
            modelSelect.appendChild(option);
        });
    }
};

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
            throw new Error(`HTTP ошибка! статус: ${response.status}`);
        }
        
        const data = await response.json();
        
        if (typingIndicator) typingIndicator.style.display = 'none';
        
        if (data.success) {
            displayRegularResult(data, clientTime);
        } else {
            if (chatResult) {
                chatResult.innerHTML = `<div class="result error">❌ Ошибка: ${data.error}</div>`;
            }
        }
            
    } catch (error) {
        if (typingIndicator) typingIndicator.style.display = 'none';
        if (chatResult) {
            chatResult.innerHTML = `<div class="result error">❌ Ошибка подключения: ${error.message}</div>`;
        }
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
            throw new Error(`HTTP ошибка! статус: ${response.status}`);
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
        
    } catch (error) {
        if (chatResult) {
            chatResult.innerHTML = `<div class="result error">❌ Ошибка потоковой передачи: ${error.message}</div>`;
        }
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

// Автоматически загружаем провайдеры при импорте модуля
window.loadProviders();