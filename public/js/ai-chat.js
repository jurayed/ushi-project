import { showError, showSuccess, showInfo } from './ui.js';

let availableProviders = [];
let availableModels = {};
let mediaRecorder = null;
let audioChunks = [];

// LIVE MODE STATE
let isLiveMode = false;
let isSpeaking = false; // ИИ говорит?
let silenceTimer = null;
let maxDurationTimer = null; // Предохранитель от длинных записей
let audioContext = null;
let analyser = null;
let microphone = null;
let javascriptNode = null;

// Настройки VAD
const VAD_THRESHOLD = 15; // Порог громкости (можно менять 10-30)
const SILENCE_DURATION = 1500; // Сколько ждать тишины (мс)
const MAX_RECORDING_TIME = 7000; // Макс длина фразы (мс) - автоотправка

// ==================== LIVE MODE LOGIC ====================

window.toggleLiveMode = async function() {
    isLiveMode = !isLiveMode;
    const container = document.getElementById('avatarContainer');
    const latencyPanel = document.getElementById('latencyPanel');
    
    if (isLiveMode) {
        container.classList.remove('hidden');
        latencyPanel.classList.remove('hidden');
        document.getElementById('liveStatus').textContent = "Инициализация...";
        
        try {
            await startVAD();
        } catch (e) {
            console.error(e);
            showError("Ошибка микрофона: " + e.message);
            toggleLiveMode(); 
        }
    } else {
        container.classList.add('hidden');
        latencyPanel.classList.add('hidden');
        stopVAD();
    }
};

async function startVAD() {
    try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        
        if (!audioContext) audioContext = new (window.AudioContext || window.webkitAudioContext)();
        if (audioContext.state === 'suspended') await audioContext.resume();
        
        analyser = audioContext.createAnalyser();
        microphone = audioContext.createMediaStreamSource(stream);
        javascriptNode = audioContext.createScriptProcessor(2048, 1, 1);

        analyser.smoothingTimeConstant = 0.8;
        analyser.fftSize = 1024;

        microphone.connect(analyser);
        analyser.connect(javascriptNode);
        javascriptNode.connect(audioContext.destination);

        mediaRecorder = new MediaRecorder(stream);
        audioChunks = [];
        
        mediaRecorder.ondataavailable = e => audioChunks.push(e.data);
        mediaRecorder.onstop = () => processLiveAudio();

        let hasSpoken = false; 
        document.getElementById('liveStatus').textContent = "Слушаю...";
        document.getElementById('liveStatus').style.color = "#00cec9";

        javascriptNode.onaudioprocess = function() {
            if (isSpeaking) return; 

            const array = new Uint8Array(analyser.frequencyBinCount);
            analyser.getByteFrequencyData(array);
            let values = 0;
            for (let i = 0; i < array.length; i++) values += array[i];
            const average = values / array.length;

            // Визуализация
            drawAvatar(average);

            // Логика обнаружения голоса
            if (average > VAD_THRESHOLD) { 
                // Громко (Говорим)
                if (!hasSpoken) {
                    if (mediaRecorder.state === 'inactive') {
                        console.log('🎤 Голос обнаружен, старт записи...');
                        mediaRecorder.start();
                        
                        // Запускаем предохранитель (чтобы не писало вечно)
                        clearTimeout(maxDurationTimer);
                        maxDurationTimer = setTimeout(() => {
                            console.log('⏱️ Максимальное время вышло, отправка...');
                            forceStopRecording();
                        }, MAX_RECORDING_TIME);
                    }
                    hasSpoken = true;
                }
                // Сбрасываем таймер тишины, пока говорим
                clearTimeout(silenceTimer);
            } else {
                // Тишина
                if (hasSpoken && mediaRecorder.state === 'recording') {
                    if (!silenceTimer) {
                        // Запускаем таймер тишины
                        silenceTimer = setTimeout(() => {
                            console.log('🤫 Тишина обнаружена, стоп...');
                            forceStopRecording();
                            hasSpoken = false; // Сброс флага
                        }, SILENCE_DURATION); 
                    }
                }
            }
        };
    } catch (e) {
        throw e;
    }
}

// Принудительная остановка и отправка
function forceStopRecording() {
    if (mediaRecorder && mediaRecorder.state === 'recording') {
        mediaRecorder.stop();
    }
    clearTimeout(silenceTimer);
    clearTimeout(maxDurationTimer);
    silenceTimer = null;
    maxDurationTimer = null;
}

function stopVAD() {
    if (mediaRecorder && mediaRecorder.state !== 'inactive') mediaRecorder.stop();
    if (microphone) microphone.disconnect();
    if (javascriptNode) javascriptNode.disconnect();
    // Не закрываем audioContext, чтобы переиспользовать
    isSpeaking = false;
    clearTimeout(silenceTimer);
    clearTimeout(maxDurationTimer);
}

async function processLiveAudio() {
    if (!isLiveMode) return;
    // Если запись слишком короткая (пустая), игнорируем
    if (audioChunks.length === 0) return;

    document.getElementById('liveStatus').textContent = "Думаю...";
    document.getElementById('liveStatus').style.color = "#a4b0be";
    isSpeaking = true; // Блокируем микрофон пока думаем

    const blob = new Blob(audioChunks, { type: 'audio/webm' });
    audioChunks = [];
    
    // Если файл слишком маленький (шум < 0.5 сек), не отправляем
    if (blob.size < 1000) {
        console.log('Audio too short, ignoring');
        isSpeaking = false;
        document.getElementById('liveStatus').textContent = "Слушаю...";
        return;
    }

    const formData = new FormData();
    formData.append('audio', blob, 'live.webm');

    const tStart = performance.now();
    let tSTT = 0;

    try {
        // 1. STT (Транскрибация)
        const resSTT = await fetch('/api/upload/transcribe', {
            method: 'POST',
            headers: { 'Authorization': 'Bearer ' + window.currentToken },
            body: formData
        });
        
        if (!resSTT.ok) {
            const errData = await resSTT.json();
            throw new Error(errData.error || "Ошибка STT");
        }

        const dataSTT = await resSTT.json();
        tSTT = performance.now() - tStart;
        
        console.log("🗣️ Вы сказали:", dataSTT.text);

        // Если текст пустой или мусорный
        if (!dataSTT.text || dataSTT.text.trim().length < 2) {
            console.log("Empty transcription");
            throw new Error("Не расслышал");
        }

        // Отображаем сообщение юзера
        appendMessage('user', dataSTT.text, { media_url: dataSTT.url, media_type: 'audio/webm' });

        // 2. LLM + TTS
        const params = getChatParams();
        const payload = {
            message: dataSTT.text,
            psychotype: params.psychotype,
            provider: params.provider,
            model: params.model,
            voice_mode: true, 
            stt_time: Math.round(tSTT)
        };

        const resAI = await fetch('/api/chat/ai', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + window.currentToken },
            body: JSON.stringify(payload)
        });
        const dataAI = await resAI.json();

        if (dataAI.success) {
            // Отображаем ответ ИИ
            appendMessage('ai', dataAI.response, { 
                psychotype: dataAI.psychotype,
                media_url: dataAI.audio_url 
            });

            updateLatencyPanel(dataAI.timings);

            if (dataAI.audio_url) {
                document.getElementById('liveStatus').textContent = "Говорю...";
                document.getElementById('liveStatus').style.color = "#6c5ce7";
                await playAudio(dataAI.audio_url);
            }
        }
    } catch (e) {
        console.warn(e.message); // Просто пишем в консоль, не спамим алертами
        document.getElementById('liveStatus').textContent = "Повторите...";
        setTimeout(() => {
             if(isLiveMode) document.getElementById('liveStatus').textContent = "Слушаю...";
        }, 1000);
    } finally {
        if (isLiveMode) {
            isSpeaking = false;
            document.getElementById('liveStatus').textContent = "Слушаю...";
            document.getElementById('liveStatus').style.color = "#00cec9";
        }
    }
}

function playAudio(url) {
    return new Promise((resolve) => {
        const audio = new Audio(url);
        audio.onended = resolve;
        audio.onerror = resolve;
        audio.play().catch(e => {
            console.error("Audio play error:", e);
            resolve();
        });
        
        const interval = setInterval(() => {
            if (audio.paused || audio.ended) {
                clearInterval(interval);
            } else {
                drawAvatar(Math.random() * 40 + 30);
            }
        }, 100);
    });
}

function updateLatencyPanel(timings) {
    const p = document.getElementById('latencyPanel');
    if(p && timings) {
        document.getElementById('latStt').innerText = timings.stt || 0;
        document.getElementById('latLlm').innerText = timings.llm || 0;
        document.getElementById('latTts').innerText = timings.tts || 0;
    }
}

function drawAvatar(volume) {
    const canvas = document.getElementById('avatarCanvas');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const w = canvas.width;
    const h = canvas.height;
    
    ctx.clearRect(0, 0, w, h);

    const baseRadius = 60;
    const scale = 1 + (volume / 60); // Чуть уменьшил чувствительность анимации
    const color = isSpeaking ? '#6c5ce7' : (volume > VAD_THRESHOLD ? '#ff7675' : '#00cec9'); 

    ctx.beginPath();
    ctx.arc(w/2, h/2, baseRadius * scale, 0, 2 * Math.PI);
    ctx.fillStyle = color;
    ctx.fill();
    
    ctx.shadowBlur = 30;
    ctx.shadowColor = color;
    ctx.stroke();
    ctx.shadowBlur = 0;
}

// ==================== MANUAL CHAT LOGIC (Старый код) ====================

window.testAIChat = async function () {
    if (!window.currentToken) return showError('Сначала войдите в систему');

    const message = document.getElementById('messageInput')?.value.trim();
    if (!message) return showError('Введите сообщение');

    document.getElementById('messageInput').value = '';
    appendMessage('user', message);

    const params = getChatParams();
    if (params.useStreaming) {
        await chatStream(params.psychotype, params.provider, params.model, message);
    } else {
        await chatRegular(params.psychotype, params.provider, params.model, message);
    }
};

function getChatParams() {
    return {
        psychotype: document.getElementById('psychotype')?.value || 'empath',
        provider: document.getElementById('provider')?.value || 'deepseek',
        model: document.getElementById('model')?.value,
        useStreaming: document.getElementById('useStreaming')?.checked
    };
}

async function chatRegular(psychotype, provider, model, message) {
    toggleTyping(true);
    try {
        const response = await fetch('/api/chat/ai', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + window.currentToken },
            body: JSON.stringify({ message, psychotype, provider, model })
        });
        const data = await response.json();
        
        toggleTyping(false);
        if (data.success) {
            appendMessage('ai', data.response, { psychotype: data.psychotype });
        } else {
            showError('AI Error: ' + data.error);
        }
    } catch (e) {
        toggleTyping(false);
        showError(e.message);
    }
}

async function chatStream(psychotype, provider, model, message) {
    const messageDiv = appendMessage('ai', '...', { psychotype });
    const contentDiv = messageDiv.querySelector('.message-content');
    
    try {
        const response = await fetch('/api/chat/ai/stream', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + window.currentToken },
            body: JSON.stringify({ message, psychotype, provider, model })
        });

        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let fullText = '';

        while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            const chunk = decoder.decode(value);
            fullText += chunk;
            contentDiv.textContent = fullText;
            scrollToBottom();
        }
    } catch (e) {
        contentDiv.innerHTML += `<br><span style="color:red">Error: ${e.message}</span>`;
    }
}

window.startAudioMessage = async function() {
    try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        mediaRecorder = new MediaRecorder(stream);
        audioChunks = [];
        mediaRecorder.ondataavailable = e => audioChunks.push(e.data);
        mediaRecorder.onstop = () => sendAudioWithTranscription();
        mediaRecorder.start();
        showInfo('🎙️ Запись...');
    } catch (e) {
        showError('Ошибка микрофона');
    }
};

window.stopAudioMessage = function() {
    if (mediaRecorder && mediaRecorder.state !== 'inactive') mediaRecorder.stop();
};

async function sendAudioWithTranscription() {
    if (audioChunks.length === 0) return;
    const blob = new Blob(audioChunks, { type: 'audio/webm' });
    const formData = new FormData();
    formData.append('audio', blob, 'voice.webm');

    try {
        showInfo('⏳ Обработка...');
        const res = await fetch('/api/upload/transcribe', {
            method: 'POST',
            headers: { 'Authorization': 'Bearer ' + window.currentToken },
            body: formData
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error);

        appendMessage('user', data.text, { media_url: data.url, media_type: 'audio/webm' });

        const params = getChatParams();
        const payload = {
            message: data.text,
            psychotype: params.psychotype,
            provider: params.provider,
            model: params.model,
            media_url: data.url,
            media_type: 'audio/webm'
        };

        if (params.useStreaming) {
            await chatStream(params.psychotype, params.provider, params.model, data.text);
        } else {
            const aiRes = await fetch('/api/chat/ai', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + window.currentToken },
                body: JSON.stringify(payload)
            });
            const aiData = await aiRes.json();
            if (aiData.success) {
                appendMessage('ai', aiData.response, { psychotype: aiData.psychotype });
            }
        }
    } catch (e) {
        showError('Ошибка: ' + e.message);
    }
}

window.loadProviders = async function() {
    try {
        const res = await fetch('/api/providers');
        const providers = await res.json();
        const select = document.getElementById('provider');
        select.innerHTML = '';
        availableModels = {};

        providers.forEach(p => {
            if (p.enabled) {
                const opt = document.createElement('option');
                opt.value = p.id;
                opt.textContent = p.name;
                select.appendChild(opt);
                availableModels[p.id] = p.models;
            }
        });
        select.addEventListener('change', updateModels);
        updateModels(); // Init models
    } catch (e) { console.error(e); }
};

function updateModels() {
    const providerId = document.getElementById('provider').value;
    const select = document.getElementById('model');
    select.innerHTML = '';
    if (availableModels[providerId]) {
        Object.entries(availableModels[providerId]).forEach(([id, info]) => {
            const opt = document.createElement('option');
            opt.value = id;
            opt.textContent = `${info.name}`;
            select.appendChild(opt);
        });
    }
}

window.loadChatHistory = async function() {
    const container = document.getElementById('aiChatContainer');
    if (!container) return;
    container.innerHTML = '';
    const res = await fetch('/api/chat/ai/history', {
        headers: { 'Authorization': 'Bearer ' + window.currentToken }
    });
    const msgs = await res.json();
    msgs.forEach(m => appendMessage(
        m.is_ai_response ? 'ai' : 'user', 
        m.message_text, 
        { media_url: m.media_url, psychotype: m.ai_psychotype }
    ));
};

function appendMessage(role, text, meta = {}) {
    const container = document.getElementById('aiChatContainer');
    const div = document.createElement('div');
    div.className = `message ${role === 'user' ? 'sent' : 'received'}`;
    let html = '';
    if (meta.media_url) {
        html += `<audio controls src="${meta.media_url}" style="max-width:200px; margin-bottom:5px;"></audio><br>`;
    }
    html += `<div class="message-content">${text || ''}</div>`;
    if (role === 'ai') html += `<div class="message-meta">${meta.psychotype || 'AI'}</div>`;
    div.innerHTML = html;
    container.appendChild(div);
    scrollToBottom();
    return div;
}

function scrollToBottom() {
    const c = document.getElementById('aiChatContainer');
    c.scrollTop = c.scrollHeight;
}

function toggleTyping(show) {
    const el = document.getElementById('typingIndicator');
    if (el) el.style.display = show ? 'block' : 'none';
}

// EXPORTS
window.testAIChat = testAIChat;
window.loadProviders = loadProviders;
window.loadChatHistory = loadChatHistory;
window.toggleLiveMode = toggleLiveMode;

console.log('✅ AI Chat module loaded');
