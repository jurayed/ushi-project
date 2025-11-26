// Chat Enhancements and Fixes
// This file is loaded after the main modules to add features and fix issues

console.log('🚀 Loading Chat Enhancements...');

// 1. Fix loadEarsInfo error
window.loadEarsInfo = async function () {
    if (!window.currentToken) return;
    try {
        const response = await fetch('/api/ears/available', {
            headers: { 'Authorization': 'Bearer ' + window.currentToken }
        });
        const data = await response.json();
        if (response.ok) {
            const earsInfo = document.getElementById('earsInfo');
            if (earsInfo) {
                earsInfo.innerHTML = `<div class="ear-status">Доступно слушателей: ${data.available_ears}</div>`;
            }
        }
    } catch (error) {
        console.error('Ошибка загрузки информации о слушателях:', error);
    }
};

// 2. Add Enter key handlers
document.addEventListener('DOMContentLoaded', () => {
    // AI Chat Enter key
    const aiInput = document.getElementById('messageInput');
    if (aiInput) {
        aiInput.addEventListener('keypress', function (e) {
            if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                window.testAIChat();
            }
        });
    }

    // Live Chat Enter key
    const liveInput = document.getElementById('conversationMessageInput');
    if (liveInput) {
        liveInput.addEventListener('keypress', function (e) {
            if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                if (window.sendConversationMessage) {
                    window.sendConversationMessage();
                }
            }
        });
    }

    // 3. Setup Hold-to-Record for AI Chat
    setupHoldToRecord();
});

// 3. WebRTC Partner ID Fix
const originalStartConversationWith = window.startConversationWith;
if (originalStartConversationWith) {
    window.startConversationWith = async function (listenerId, listenerName) {
        window.currentPartnerId = listenerId;
        return originalStartConversationWith.call(this, listenerId, listenerName);
    };
}

// 4. Hold-to-Record Implementation
function setupHoldToRecord() {
    const recordBtn = document.getElementById('recordButton');
    if (!recordBtn) return;

    // Remove existing click handlers (clone node to strip listeners)
    const newBtn = recordBtn.cloneNode(true);
    recordBtn.parentNode.replaceChild(newBtn, recordBtn);

    // Add visual feedback class
    const addActive = () => newBtn.classList.add('recording-active');
    const removeActive = () => newBtn.classList.remove('recording-active');

    // Override start/stop to NOT toggle buttons
    // We need to redefine them to use the same logic but different UI behavior

    // We use the existing mediaRecorder and audioChunks from ai-chat.js 
    // BUT they are not exposed. We need to create our own state here.
    let localMediaRecorder = null;
    let localAudioChunks = [];

    window.startAudioMessage = async function () {
        try {
            const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
            localMediaRecorder = new MediaRecorder(stream);
            localAudioChunks = [];

            localMediaRecorder.ondataavailable = event => {
                localAudioChunks.push(event.data);
            };

            localMediaRecorder.onstop = async () => {
                // Only send if we have chunks and it wasn't cancelled
                if (localAudioChunks.length > 0) {
                    const audioBlob = new Blob(localAudioChunks, { type: 'audio/webm' });
                    if (window.sendAudioMessage) {
                        await window.sendAudioMessage(audioBlob);
                    } else {
                        console.error('sendAudioMessage not available');
                    }
                }
            };

            localMediaRecorder.start();
            showInfo('Запись голосового...');
            addActive();

        } catch (error) {
            console.error('Mic error:', error);
            showError('Ошибка микрофона');
        }
    };

    window.stopAudioMessage = function () {
        if (localMediaRecorder && localMediaRecorder.state !== 'inactive') {
            localMediaRecorder.stop();
            removeActive();
        }
    };

    window.cancelAudioMessage = function () {
        if (localMediaRecorder && localMediaRecorder.state !== 'inactive') {
            localMediaRecorder.onstop = null; // Prevent sending
            localMediaRecorder.stop();
            localAudioChunks = [];
            removeActive();
            showInfo('Запись отменена');
        }
    };

    // Attach events
    newBtn.addEventListener('mousedown', (e) => {
        e.preventDefault();
        window.startAudioMessage();
    });

    newBtn.addEventListener('mouseup', (e) => {
        e.preventDefault();
        window.stopAudioMessage();
    });

    newBtn.addEventListener('mouseleave', (e) => {
        if (newBtn.classList.contains('recording-active')) {
            e.preventDefault();
            window.cancelAudioMessage();
        }
    });

    // Touch support
    newBtn.addEventListener('touchstart', (e) => {
        e.preventDefault();
        window.startAudioMessage();
    });

    newBtn.addEventListener('touchend', (e) => {
        e.preventDefault();
        window.stopAudioMessage();
    });
}

// Helper to show info (if not imported)
function showInfo(msg) {
    const toast = document.createElement('div');
    toast.className = 'toast info';
    toast.textContent = msg;
    document.body.appendChild(toast);
    setTimeout(() => toast.remove(), 3000);
}

function showError(msg) {
    const toast = document.createElement('div');
    toast.className = 'toast error';
    toast.textContent = msg;
    document.body.appendChild(toast);
    setTimeout(() => toast.remove(), 3000);
}
