// public/js/webrtc.js
import { showError, showSuccess } from './ui.js';

// Используем глобальные переменные из CDN
const SimplePeer = window.SimplePeer;
const RecordRTC = window.RecordRTC;

// Проверяем, не объявлен ли уже класс
if (typeof window.WebRTCManager !== 'undefined') {
    console.log('WebRTCManager уже инициализирован');
} else {
    class WebRTCManager {
        constructor() {
            this.localStream = null;
            this.remoteStream = null;
            this.peer = null;
            this.isCalling = false;
            this.isInCall = false;
            this.callType = null;
            this.mediaRecorder = null;
            this.audioChunks = [];
            this.isRecording = false;
            this.currentTargetUserId = null;
        }

        // Инициализация медиапотока
        async initLocalStream(video = true, audio = true) {
            try {
                this.localStream = await navigator.mediaDevices.getUserMedia({
                    video: video,
                    audio: audio
                });
                return this.localStream;
            } catch (error) {
                console.error('Ошибка доступа к медиаустройствам:', error);
                throw error;
            }
        }

        // Остановка медиапотока
        stopLocalStream() {
            if (this.localStream) {
                this.localStream.getTracks().forEach(track => track.stop());
                this.localStream = null;
            }
        }

        // Начать звонок
        async startCall(targetUserId, withVideo = true) {
            try {
                if (!window.socket) {
                    throw new Error('Socket не подключен');
                }

                if (!SimplePeer) {
                    throw new Error('SimplePeer не загружен. Добавьте CDN скрипт в HTML.');
                }

                this.isCalling = true;
                this.callType = withVideo ? 'video' : 'audio';
                this.currentTargetUserId = targetUserId;
                
                await this.initLocalStream(withVideo, true);
                
                // Создаем Peer соединение
                this.peer = new SimplePeer({
                    initiator: true,
                    trickle: false,
                    stream: this.localStream,
                    config: {
                        iceServers: [
                            { urls: 'stun:stun.l.google.com:19302' },
                            { urls: 'stun:global.stun.twilio.com:3478' }
                        ]
                    }
                });

                this.peer.on('signal', (data) => {
                    window.socket.emit('start-call', {
                        to: targetUserId,
                        signal: data,
                        withVideo: withVideo
                    });
                });

                this.peer.on('stream', (stream) => {
                    this.remoteStream = stream;
                    this.playRemoteStream();
                    showSuccess('Соединение установлено!');
                });

                this.peer.on('close', () => {
                    this.endCall();
                });

                this.peer.on('error', (error) => {
                    console.error('WebRTC ошибка:', error);
                    showError('Ошибка соединения: ' + error.message);
                    this.endCall();
                });

                this.showCallInterface(true);

            } catch (error) {
                console.error('Ошибка начала звонка:', error);
                showError('Не удалось начать звонок: ' + error.message);
                this.endCall();
            }
        }

        // Принять звонок
        async acceptCall(callData) {
            try {
                if (!SimplePeer) {
                    throw new Error('SimplePeer не загружен. Добавьте CDN скрипт в HTML.');
                }

                this.isInCall = true;
                this.callType = callData.withVideo ? 'video' : 'audio';
                this.currentTargetUserId = callData.from;
                
                await this.initLocalStream(callData.withVideo, true);

                this.peer = new SimplePeer({
                    initiator: false,
                    trickle: false,
                    stream: this.localStream,
                    config: {
                        iceServers: [
                            { urls: 'stun:stun.l.google.com:19302' },
                            { urls: 'stun:global.stun.twilio.com:3478' }
                        ]
                    }
                });

                this.peer.on('signal', (data) => {
                    window.socket.emit('webrtc-signal', {
                        to: callData.from,
                        signal: data
                    });
                });

                this.peer.on('stream', (stream) => {
                    this.remoteStream = stream;
                    this.playRemoteStream();
                    showSuccess('Соединение установлено!');
                });

                this.peer.on('close', () => {
                    this.endCall();
                });

                this.peer.on('error', (error) => {
                    console.error('WebRTC ошибка:', error);
                    showError('Ошибка соединения: ' + error.message);
                    this.endCall();
                });

                this.peer.signal(callData.signal);
                this.showCallInterface(false);

            } catch (error) {
                console.error('Ошибка принятия звонка:', error);
                showError('Не удалось принять звонок: ' + error.message);
                this.endCall();
            }
        }

        // Отклонить звонок
        rejectCall(callData) {
            window.socket.emit('call-rejected', { to: callData.from });
            this.hideCallInterface();
            showSuccess('Звонок отклонен');
        }

        // Завершить звонок
        endCall() {
            if (this.peer) {
                this.peer.destroy();
                this.peer = null;
            }
            this.stopLocalStream();
            this.isCalling = false;
            this.isInCall = false;
            this.hideCallInterface();
            
            if (window.socket && this.currentTargetUserId) {
                window.socket.emit('end-call', { to: this.currentTargetUserId });
            }
            
            showSuccess('Звонок завершен');
        }

        // Воспроизведение удаленного потока
        playRemoteStream() {
            const remoteVideo = document.getElementById('remoteVideo');
            if (remoteVideo && this.remoteStream) {
                remoteVideo.srcObject = this.remoteStream;
            }
        }

        // Показать интерфейс звонка
        showCallInterface(isCaller) {
            let callInterface = document.getElementById('callInterface');
            if (!callInterface) {
                callInterface = this.createCallInterface();
            }
            callInterface.classList.remove('hidden');

            const callStatus = document.getElementById('callStatus');
            if (callStatus) {
                callStatus.textContent = isCaller ? 'Звонок...' : 'Входящий звонок...';
            }

            // Показываем локальное видео
            const localVideo = document.getElementById('localVideo');
            if (localVideo && this.localStream) {
                localVideo.srcObject = this.localStream;
            }
        }

        // Скрыть интерфейс звонка
        hideCallInterface() {
            const callInterface = document.getElementById('callInterface');
            if (callInterface) {
                callInterface.classList.add('hidden');
            }
        }

        // Создание интерфейса звонка
        createCallInterface() {
            const callInterface = document.createElement('div');
            callInterface.id = 'callInterface';
            callInterface.className = 'call-interface hidden';
            callInterface.innerHTML = `
                <div class="call-modal">
                    <h3 id="callStatus">Звонок</h3>
                    <div class="video-container">
                        <video id="remoteVideo" autoplay playsinline></video>
                        <video id="localVideo" autoplay playsinline muted></video>
                    </div>
                    <div class="call-controls">
                        <button id="endCallButton" class="btn-danger">Завершить звонок</button>
                    </div>
                </div>
            `;
            document.body.appendChild(callInterface);

            document.getElementById('endCallButton').addEventListener('click', () => {
                this.endCall();
            });

            return callInterface;
        }

        // Запись аудиосообщения
        async startAudioRecording() {
            try {
                if (!RecordRTC) {
                    throw new Error('RecordRTC не загружен. Добавьте CDN скрипт в HTML.');
                }

                const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
                this.mediaRecorder = RecordRTC(stream, {
                    type: 'audio',
                    mimeType: 'audio/wav',
                    recorderType: RecordRTC.StereoAudioRecorder
                });
                this.mediaRecorder.startRecording();
                this.isRecording = true;
                return true;
            } catch (error) {
                console.error('Ошибка начала записи:', error);
                throw error;
            }
        }

        async stopAudioRecording() {
            return new Promise((resolve) => {
                if (this.mediaRecorder && this.isRecording) {
                    this.mediaRecorder.stopRecording(() => {
                        const audioBlob = this.mediaRecorder.getBlob();
                        this.isRecording = false;
                        
                        // Останавливаем все треки
                        const stream = this.mediaRecorder.getBlob().stream;
                        if (stream && stream.getTracks) {
                            stream.getTracks().forEach(track => track.stop());
                        }
                        
                        resolve(audioBlob);
                    });
                } else {
                    resolve(null);
                }
            });
        }
    }

    // Создаем глобальный экземпляр
    window.webrtcManager = new WebRTCManager();
}

// Socket event handlers для WebRTC
export function setupWebRTCListeners() {
    if (!window.socket) return;

    window.socket.on('incoming-call', (data) => {
        const accept = confirm(`Входящий ${data.withVideo ? 'видео' : 'аудио'} звонок от пользователя ${data.from}. Принять?`);
        if (accept) {
            window.webrtcManager.acceptCall(data);
        } else {
            window.webrtcManager.rejectCall(data);
        }
    });

    window.socket.on('webrtc-signal', (data) => {
        if (window.webrtcManager.peer) {
            window.webrtcManager.peer.signal(data.signal);
        }
    });

    window.socket.on('call-ended', () => {
        window.webrtcManager.endCall();
    });

    window.socket.on('call-rejected', () => {
        showError('Звонок отклонен');
        window.webrtcManager.endCall();
    });
}

// Глобальные функции для вызова из HTML
window.startAudioCall = function() {
    // Для демонстрации звоним сами себе
    // В реальном приложении нужно выбрать пользователя из списка
    const targetUserId = window.socket?.id;
    if (targetUserId) {
        window.webrtcManager.startCall(targetUserId, false);
    } else {
        showError('Socket не подключен');
    }
};

window.startVideoCall = function() {
    const targetUserId = window.socket?.id;
    if (targetUserId) {
        window.webrtcManager.startCall(targetUserId, true);
    } else {
        showError('Socket не подключен');
    }
};

window.startAudioMessage = async function() {
    try {
        const audioBlob = await recordAudioMessage();
        if (audioBlob) {
            const audioUrl = URL.createObjectURL(audioBlob);
            const audio = new Audio(audioUrl);
            audio.play();
            showSuccess('Аудиосообщение записано и воспроизводится!');
            setTimeout(() => URL.revokeObjectURL(audioUrl), 1000);
        }
    } catch (error) {
        showError('Ошибка записи: ' + error.message);
    }
};

// Функция записи аудиосообщения
async function recordAudioMessage() {
    return new Promise(async (resolve, reject) => {
        try {
            await window.webrtcManager.startAudioRecording();
            
            const recordTime = 5; // секунд
            let timeLeft = recordTime;
            
            const recordIndicator = document.createElement('div');
            recordIndicator.className = 'record-indicator';
            recordIndicator.innerHTML = `
                <div style="position: fixed; top: 50%; left: 50%; transform: translate(-50%, -50%); 
                           background: rgba(0,0,0,0.8); color: white; padding: 20px; border-radius: 10px;
                           text-align: center; z-index: 1000;">
                    <div style="font-size: 24px; margin-bottom: 10px;">🎤 Запись...</div>
                    <div style="font-size: 18px; margin-bottom: 15px;">${timeLeft} сек</div>
                    <button id="stopRecordingBtn" style="margin-top: 10px; padding: 8px 16px; background: #dc3545; color: white; border: none; border-radius: 5px; cursor: pointer;">
                        Остановить запись
                    </button>
                </div>
            `;
            document.body.appendChild(recordIndicator);
            
            // Таймер обратного отсчета
            const timer = setInterval(() => {
                timeLeft--;
                recordIndicator.querySelector('div:nth-child(2)').textContent = `${timeLeft} сек`;
                
                if (timeLeft <= 0) {
                    clearInterval(timer);
                    stopRecording();
                }
            }, 1000);
            
            // Функция для остановки записи
            const stopRecording = async function() {
                clearInterval(timer);
                const audioBlob = await window.webrtcManager.stopAudioRecording();
                document.body.removeChild(recordIndicator);
                resolve(audioBlob);
            };
            
            // Назначаем обработчик на кнопку
            document.getElementById('stopRecordingBtn').addEventListener('click', stopRecording);
            
        } catch (error) {
            reject(error);
        }
    });
}