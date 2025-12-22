import { showError, showSuccess, showInfo } from './ui.js';

// ТЕКСТЫ ПСИХОТИПОВ
const PSYCHOTYPE_PROMPTS = {
    empath: "Ты эмпатичный собеседник. Ты внимательно слушаешь, поддерживаешь эмоциональный контакт. Твои ответы мягкие, теплые. Ты используешь имя собеседника.",
    rational: "Ты рациональный аналитик. Ты говоришь четко, по делу, оперируешь фактами. Эмоции вторичны, главное — логика и польза.",
    optimist: "Ты неунывающий оптимист! Ты всегда видишь стакан наполовину полным. Ты шутишь, подбадриваешь и заряжаешь энергией."
};

let availableProviders = [];
let availableModels = {};
let providerDefaults = {}; 
let isLiveMode = false;

// Pagination variables
let oldestLoadedId = Infinity;
let isLoadingHistory = false;
let allHistoryLoaded = false;

// STREAMING & AUDIO
let audioContext = null;
let processor = null;
let source = null;
let audioQueue = [];
let isPlayingAudio = false;
let currentAiBubble = null;

// RECORDING
let manualMediaRecorder = null;
let manualAudioChunks = [];
let recordStartTime = 0;

// === НОВАЯ ФУНКЦИЯ ОЗВУЧКИ (TTS) ===
async function playHighQualityTTS(text) {
    if (!text) return;
    try {
        const response = await fetch('/api/tts', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ text })
        });
        const blob = await response.blob();
        const url = URL.createObjectURL(blob);
        const audio = new Audio(url);
        audio.volume = 1.0; // На всякий случай
		// Этот трюк заставляет iOS/Android думать, что это важный звук
		if (typeof audio.sinkId !== 'undefined') { 
			audio.setSinkId('default'); 
		}
		audio.play();
    } catch (e) {
        console.warn("HQ TTS failed", e);
    }
}

// === LIVE MODE ===
window.toggleLiveMode = async function() {
    isLiveMode = !isLiveMode;
    const container = document.getElementById('avatarContainer');
    const latencyPanel = document.getElementById('latencyPanel');
    const status = document.getElementById('liveStatus');
    
    if (isLiveMode) {
        if (!window.socket) {
            showError("Ошибка: Сокет не подключен");
            isLiveMode = false;
            return;
        }
        container.classList.remove('hidden');
        latencyPanel.classList.remove('hidden');
        status.textContent = "Подключение...";
        
        try { await startStreaming(); } 
        catch (e) {
            console.error(e);
            showError("Микрофон недоступен");
            isLiveMode = false;
            container.classList.add('hidden');
        }
    } else {
        container.classList.add('hidden');
        latencyPanel.classList.add('hidden');
        stopStreaming();
    }
};

async function startStreaming() {
    audioContext = new (window.AudioContext || window.webkitAudioContext)({ sampleRate: 16000 });
    const stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } });

    const params = getChatParams();
    window.socket.emit('start_voice_chat', { 
        systemPrompt: params.systemPrompt,
        provider: params.provider,
        model: params.model
    });
    
    setupSocketVoiceListeners();

    source = audioContext.createMediaStreamSource(stream);
    processor = audioContext.createScriptProcessor(4096, 1, 1);
    source.connect(processor);
    processor.connect(audioContext.destination);

    document.getElementById('liveStatus').textContent = "Слушаю...";
    
    processor.onaudioprocess = (e) => {
        if (!isLiveMode) return;
        const inputData = e.inputBuffer.getChannelData(0);
        
        let sum = 0;
        for (let i = 0; i < inputData.length; i++) sum += Math.abs(inputData[i]);
        if (!isPlayingAudio) drawAvatar(Math.max(10, (sum / inputData.length) * 500));

        const buffer = convertFloat32ToInt16(inputData);
        window.socket.emit('audio_stream_data', buffer);
    };
}

function stopStreaming() {
    if (window.socket) {
        window.socket.emit('stop_voice_chat');
        window.socket.off('user_transcription');
        window.socket.off('ai_text_chunk');
        window.socket.off('ai_audio_chunk');
        window.socket.off('ai_response_complete');
        window.socket.off('latency_metric');
    }
    if (source) source.disconnect();
    if (processor) processor.disconnect();
    if (audioContext) audioContext.close();
    source = null; processor = null; audioContext = null;
    audioQueue = []; isPlayingAudio = false; currentAiBubble = null;
}

function setupSocketVoiceListeners() {
    window.socket.on('user_transcription', (data) => {
        const status = document.getElementById('liveStatus');
        if (data.isFinal) {
            status.textContent = "Думаю...";
            status.style.color = "#a4b0be";
            appendMessage('user', data.text);
        } else {
            status.textContent = "Слушаю: " + data.text;
        }
    });

    window.socket.on('ai_text_chunk', (data) => {
        if (!data.text) return;
        if (!currentAiBubble) currentAiBubble = appendMessage('ai', '', { psychotype: getChatParams().psychotype });
        const contentDiv = currentAiBubble.querySelector('.message-content');
        if (contentDiv) {
            contentDiv.textContent += data.text;
            scrollToBottom();
        }
    });

    window.socket.on('ai_audio_chunk', (ab) => { audioQueue.push(ab); processAudioQueue(); });
    window.socket.on('ai_response_complete', () => { currentAiBubble = null; });
    
    window.socket.on('latency_metric', (data) => {
        const el = document.getElementById(data.type === 'stt' ? 'latStt' : data.type === 'llm' ? 'latLlm' : 'latTts');
        if(el) el.textContent = data.value;
    });
}

async function processAudioQueue() {
    if (isPlayingAudio || audioQueue.length === 0) return;
    isPlayingAudio = true;
    const status = document.getElementById('liveStatus');
    status.textContent = "Говорю...";
    status.style.color = "#6c5ce7";

    try {
        const chunk = audioQueue.shift();
        const tempCtx = new (window.AudioContext || window.webkitAudioContext)();
        
        // --- ФИКС ГРОМКОСТИ START ---
        // Создаем усилитель (GainNode)
        const gainNode = tempCtx.createGain();
        // Устанавливаем громкость: 1.0 = 100%, 2.5 = 250% (экспериментируйте, если будет хрипеть)
        gainNode.gain.value = 3.0; 
        
        // Добавляем компрессор (выравнивает тихие и громкие звуки)
        const compressor = tempCtx.createDynamicsCompressor();
        compressor.threshold.value = -50;
        compressor.knee.value = 40;
        compressor.ratio.value = 12;
        compressor.attack.value = 0;
        compressor.release.value = 0.25;

        const audioBuffer = await tempCtx.decodeAudioData(chunk);
        const sn = tempCtx.createBufferSource();
        sn.buffer = audioBuffer;
        
        // Цепочка подключения: Источник -> Компрессор -> Усилитель -> Динамики
        sn.connect(compressor);
        compressor.connect(gainNode);
        gainNode.connect(tempCtx.destination);
        // --- ФИКС ГРОМКОСТИ END ---

        sn.start(0);

        const animInterval = setInterval(() => drawAvatar(Math.random() * 50 + 40), 100);

        sn.onended = () => {
            clearInterval(animInterval);
            isPlayingAudio = false;
            // Важно закрывать контекст, чтобы не текла память на мобильных
            if (tempCtx.state !== 'closed') tempCtx.close();
            
            if (audioQueue.length === 0) {
                status.textContent = "Слушаю...";
                status.style.color = "#00cec9";
            }
            processAudioQueue();
        };
    } catch (e) {
        console.error(e);
        isPlayingAudio = false;
        processAudioQueue();
    }
}

// ==================== MANUAL RECORDING ====================
window.startAudioMessage = async function() {
    if (manualMediaRecorder && manualMediaRecorder.state === 'recording') return;
    try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        manualMediaRecorder = new MediaRecorder(stream);
        manualAudioChunks = [];
        recordStartTime = Date.now();
        manualMediaRecorder.ondataavailable = e => { if (e.data.size > 0) manualAudioChunks.push(e.data); };
        manualMediaRecorder.onstop = () => { stream.getTracks().forEach(track => track.stop()); sendAudioWithTranscription(); };
        manualMediaRecorder.start();
        showInfo('🎙️ Запись...');
    } catch (e) { showError(e.message); }
};

window.stopAudioMessage = function() {
    if (manualMediaRecorder && manualMediaRecorder.state === 'recording') {
        if (Date.now() - recordStartTime < 600) {
            manualMediaRecorder.stop();
            manualAudioChunks = [];
            showInfo('❌ Слишком коротко');
            return;
        }
        manualMediaRecorder.stop(); 
        showInfo('⏳ Обработка...');
    }
};

async function sendAudioWithTranscription() {
    if (manualAudioChunks.length === 0) return;
    const blob = new Blob(manualAudioChunks, { type: 'audio/webm' });
    if (blob.size < 1500) return;

    const formData = new FormData();
    formData.append('audio', blob, 'voice.webm');

    try {
        const res = await fetch('/api/upload/transcribe', {
            method: 'POST',
            headers: { 'Authorization': 'Bearer ' + window.currentToken },
            body: formData
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error);

        appendMessage('user', data.text, { media_url: data.url });
        
        const params = getChatParams();
        if (params.useStreaming) await chatStream(params.psychotype, params.provider, params.model, data.text, params.systemPrompt);
        else await chatRegular(params.psychotype, params.provider, params.model, data.text, params.systemPrompt);

    } catch (e) { showError(e.message); }
}

// ==================== TEXT CHAT ====================
window.testAIChat = async function () {
    const msg = document.getElementById('messageInput')?.value.trim();
    if (!msg) return;
    document.getElementById('messageInput').value = '';
    appendMessage('user', msg);
    
    const params = getChatParams();
    if (params.useStreaming) await chatStream(params.psychotype, params.provider, params.model, msg, params.systemPrompt);
    else await chatRegular(params.psychotype, params.provider, params.model, msg, params.systemPrompt);
};

async function chatRegular(psychotype, provider, model, message, systemPrompt) {
    toggleTyping(true);
    try {
        const response = await fetch('/api/chat/ai', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + window.currentToken },
            body: JSON.stringify({ message, psychotype, provider, model, systemPrompt })
        });
        const data = await response.json();
        toggleTyping(false);
        if (data.success) {
            appendMessage('ai', data.response, { psychotype });
            playHighQualityTTS(data.response);
            updateLatencyPanel(data.timings);
        }
    } catch (e) { toggleTyping(false); showError(e.message); }
}

async function chatStream(psychotype, provider, model, message, systemPrompt) {
    const messageDiv = appendMessage('ai', '...', { psychotype });
    const contentDiv = messageDiv.querySelector('.message-content');
    let fullResponse = ""; 

    try {
        const response = await fetch('/api/chat/ai/stream', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + window.currentToken },
            body: JSON.stringify({ message, psychotype, provider, model, systemPrompt })
        });
        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            const textChunk = decoder.decode(value);
            contentDiv.textContent += textChunk;
            fullResponse += textChunk;
            scrollToBottom();
        }
        playHighQualityTTS(fullResponse);
    } catch (e) { contentDiv.innerHTML += `<br><span style="color:red">Error: ${e.message}</span>`; }
}

// ==================== HISTORY & INIT ====================

document.addEventListener('DOMContentLoaded', () => {
    const btn = document.getElementById('recordButton');
    if (btn) {
        btn.onmousedown = window.startAudioMessage;
        btn.onmouseup = window.stopAudioMessage;
        btn.ontouchstart = (e) => { e.preventDefault(); window.startAudioMessage(); };
        btn.ontouchend = (e) => { e.preventDefault(); window.stopAudioMessage(); };
    }

    const msgInput = document.getElementById('messageInput');
    if (msgInput) {
        msgInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') window.testAIChat();
        });
    }

    const psychotypeSelect = document.getElementById('psychotype');
    const promptArea = document.getElementById('systemPrompt');
    if (psychotypeSelect && promptArea) {
        psychotypeSelect.addEventListener('change', () => {
            promptArea.value = PSYCHOTYPE_PROMPTS[psychotypeSelect.value];
            localStorage.setItem('selectedPsychotype', psychotypeSelect.value);
        });
        const savedType = localStorage.getItem('selectedPsychotype') || 'empath';
        psychotypeSelect.value = savedType;
        promptArea.value = PSYCHOTYPE_PROMPTS[savedType] || "";
    }

    // Слушатель скролла для подгрузки истории
    const chatContainer = document.getElementById('aiChatContainer');
    if (chatContainer) {
        chatContainer.addEventListener('scroll', () => {
            // Если прокрутили до верха и не загружаем сейчас и есть что грузить
            if (chatContainer.scrollTop < 50 && !isLoadingHistory && !allHistoryLoaded) {
                window.loadChatHistory(true);
            }
        });
    }

    window.loadProviders();
});

function updateLatencyPanel(timings) {
    if(timings) {
        document.getElementById('latStt').innerText = timings.stt || 0;
        document.getElementById('latLlm').innerText = timings.llm || 0;
        document.getElementById('latTts').innerText = timings.tts || 0;
    }
}

window.loadProviders = async function() {
    try {
        console.log("Loading providers...");
        const res = await fetch('/api/providers');
        const providers = await res.json();
        const select = document.getElementById('provider');
        select.innerHTML = '';
        availableModels = {};
        providerDefaults = {}; 

        let groqIndex = -1;
        
        providers.forEach((p, index) => {
            if (p.enabled) {
                const opt = document.createElement('option');
                opt.value = p.id;
                opt.textContent = p.name;
                select.appendChild(opt);
                
                availableModels[p.id] = p.models;
                providerDefaults[p.id] = p.defaultModel; 
                
                if (p.id.toLowerCase().includes('groq')) {
                    groqIndex = index;
                    // Fix models array safety
                    const modelsList = Array.isArray(p.models) 
                        ? p.models 
                        : Object.entries(p.models).map(([k, v]) => ({id: k, ...v}));
                    
                    const llamaModel = modelsList.find(m => m.id.includes('llama') && m.id.includes('8b'));
                    if (llamaModel) providerDefaults[p.id] = llamaModel.id;
                }
            }
        });
        
        if (groqIndex !== -1) select.selectedIndex = groqIndex;
        else if (select.options.length > 0) select.selectedIndex = 0;

        if (select.options.length > 0) updateModels();
        select.addEventListener('change', updateModels);
    } catch (e) { console.error("Providers Load Error:", e); }
};

function updateModels() {
    const providerId = document.getElementById('provider').value;
    const select = document.getElementById('model');
    select.innerHTML = '';
    
    const models = availableModels[providerId];
    const defaultTarget = providerDefaults[providerId]; 
    let defaultFound = false;

    if (models) {
        const modelsList = Array.isArray(models) ? models : Object.entries(models).map(([k, v]) => ({id: k, ...v}));

        modelsList.forEach((info) => {
            const id = info.id || info; 
            const name = info.name || id;

            const opt = document.createElement('option');
            opt.value = id;
            opt.textContent = name;
            select.appendChild(opt);

            if (id === defaultTarget) defaultFound = true;
        });

        if (defaultFound) select.value = defaultTarget;
        else if (select.options.length > 0) {
            select.selectedIndex = 0;
            console.warn(`Default model missing. Auto-selected: ${select.value}`);
        }
    }
}

// <<<--- ИЗМЕНЕНИЕ: ЛОГИКА ПАГИНАЦИИ ИСТОРИИ
window.loadChatHistory = async function(isLoadMore = false) {
    const container = document.getElementById('aiChatContainer');
    if (!container) return;
    
    if (isLoadingHistory) return;
    isLoadingHistory = true;

    // Если это первоначальная загрузка - сбрасываем счетчик
    if (!isLoadMore) {
        container.innerHTML = '';
        oldestLoadedId = Infinity;
        allHistoryLoaded = false;
    }

    const prevHeight = container.scrollHeight;
    
    try {
        const url = `/api/chat/ai/history?limit=30&beforeId=${oldestLoadedId !== Infinity ? oldestLoadedId : ''}`;
        
        const res = await fetch(url, {
            headers: { 'Authorization': 'Bearer ' + window.currentToken }
        });
        const msgs = await res.json();
        
        if (msgs.length === 0) {
            allHistoryLoaded = true;
            if (!isLoadMore) container.innerHTML = '<div style="text-align:center; opacity:0.5; margin-top:50px;">Начните общение ✨</div>';
        } else {
            // Обновляем самый старый ID
            oldestLoadedId = msgs[0].id;
            
            // Отрисовываем
            msgs.forEach(m => {
                // Если "loadMore" - вставляем в начало (prepend), иначе в конец (append)
                // Но так как у нас функция appendMessage, мы просто используем prepend для DOM элемента
                const msgEl = createMessageElement(
                    m.is_ai_response ? 'ai' : 'user', 
                    m.message_text, 
                    { media_url: m.media_url, psychotype: m.ai_psychotype, created_at: m.sent_at }
                );
                
                if (isLoadMore) {
                    container.insertBefore(msgEl, container.firstChild);
                } else {
                    container.appendChild(msgEl);
                }
            });

            // Если "loadMore", нужно восстановить позицию скролла
            if (isLoadMore) {
                const newHeight = container.scrollHeight;
                container.scrollTop = newHeight - prevHeight;
            } else {
                scrollToBottom();
            }
        }
    } catch (e) {
        console.error(e);
    } finally {
        isLoadingHistory = false;
    }
};

function convertFloat32ToInt16(buffer) {
    let l = buffer.length;
    let buf = new Int16Array(l);
    while (l--) { buf[l] = Math.min(1, buffer[l]) * 0x7FFF; }
    return buf.buffer;
}

function drawAvatar(volume) {
    const canvas = document.getElementById('avatarCanvas');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const w = canvas.width;
    const h = canvas.height;
    ctx.clearRect(0, 0, w, h);
    const baseRadius = 60;
    const scale = 1 + (volume / 100); 
    let color = isPlayingAudio ? '#6c5ce7' : '#00cec9'; 
    ctx.beginPath();
    ctx.arc(w/2, h/2, baseRadius * scale, 0, 2 * Math.PI);
    ctx.fillStyle = color;
    ctx.fill();
}

function getChatParams() {
    return {
        psychotype: document.getElementById('psychotype')?.value || 'empath',
        provider: document.getElementById('provider')?.value || 'deepseek',
        model: document.getElementById('model')?.value,
        useStreaming: document.getElementById('useStreaming')?.checked,
        systemPrompt: document.getElementById('systemPrompt')?.value
    };
}

// <<<--- ИЗМЕНЕНИЕ: ОТДЕЛЬНАЯ ФУНКЦИЯ СОЗДАНИЯ ЭЛЕМЕНТА (для гибкости)
function createMessageElement(role, text, meta = {}) {
    const div = document.createElement('div');
    div.className = `message ${role === 'user' ? 'sent' : 'received'}`;
    let html = '';
    if (meta.media_url) html += `<audio controls src="${meta.media_url}" style="max-width:200px; margin-bottom:5px;"></audio><br>`;
    html += `<div class="message-content">${text || ''}</div>`;
    if (role === 'ai') html += `<div class="message-meta">${meta.psychotype || 'AI'}</div>`;
    
    // 🔥 ДОБАВЛЕНО ВРЕМЯ
    const timeStr = meta.created_at ? new Date(meta.created_at).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'}) : new Date().toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'});
    html += `<span class="msg-time">${timeStr}</span>`;

    div.innerHTML = html;
    return div;
}

// Wrapper для совместимости со старым кодом
function appendMessage(role, text, meta = {}) {
    const container = document.getElementById('aiChatContainer');
    const el = createMessageElement(role, text, meta);
    container.appendChild(el);
    scrollToBottom();
    return el;
}

function scrollToBottom() { const c = document.getElementById('aiChatContainer'); c.scrollTop = c.scrollHeight; }
function toggleTyping(show) { const el = document.getElementById('typingIndicator'); if(el) el.style.display = show ? 'block' : 'none'; }

// ФУНКЦИЯ ОЧИСТКИ ИСТОРИИ
window.clearHistory = async function() {
    if (!confirm('Вы уверены? Это удалит всю переписку с ИИ навсегда.')) return;
    
    try {
        const res = await fetch('/api/chat/ai/history', {
            method: 'DELETE',
            headers: { 'Authorization': 'Bearer ' + window.currentToken }
        });
        
        if (res.ok) {
            const container = document.getElementById('aiChatContainer');
            if (container) container.innerHTML = '<div style="text-align:center; opacity:0.5; margin-top:50px;">История очищена ✨</div>';
            showSuccess('Память ИИ стерта');
            toggleAiSettings(false); 
        } else {
            showError('Ошибка очистки');
        }
    } catch (e) {
        showError(e.message);
    }
};

window.toggleLiveMode = toggleLiveMode;
window.startAudioMessage = startAudioMessage;
window.stopAudioMessage = stopAudioMessage;
window.testAIChat = testAIChat;
window.loadProviders = loadProviders;
window.loadChatHistory = loadChatHistory;

console.log('✅ AI Chat module loaded (Pagination & Timestamps)');
