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

                // Создаем Peer соединение (initiator: true)
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
                    // Отправляем сигнал вызова
                    window.socket.emit('call_user', {
                        toUserId: targetUserId,
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
                this.currentTargetUserId = callData.fromUserId;

                await this.initLocalStream(callData.withVideo, true);

                // Создаем Peer соединение (initiator: false)
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
                    // Отправляем сигнал принятия вызова
                    window.socket.emit('answer_call', {
                        toUserId: callData.fromUserId,
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

                // Применяем сигнал от звонящего
                this.peer.signal(callData.signal);
                this.showCallInterface(false);

            } catch (error) {
                console.error('Ошибка принятия звонка:', error);
                showError('Не удалось принять звонок: ' + error.message);
                this.endCall();
            }
        }

        // Обработка принятия звонка (для инициатора)
        handleCallAccepted(signal) {
            if (this.peer) {
                this.peer.signal(signal);
                showSuccess('Собеседник принял вызов!');
            }
        }

        // Обработка ICE кандидата
        handleIceCandidate(candidate) {
            // SimplePeer с trickle: false обычно обрабатывает кандидаты внутри signal
            // Но если мы решим использовать trickle: true, это пригодится
            // В данной реализации мы используем full signal exchange, так что это может быть не нужно
            // если signal содержит все кандидаты.
            // Оставим пока пустым или реализуем если перейдем на trickle
        }

        // Отклонить звонок
        rejectCall(targetUserId) {
            window.socket.emit('reject_call', { toUserId: targetUserId });
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
                window.socket.emit('end_call', { toUserId: this.currentTargetUserId });
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
                <div class="call-modal glass-panel">
                    <h3 id="callStatus" style="margin-bottom: 20px;">Звонок</h3>
                    <div class="video-container" style="background: black; border-radius: 10px; overflow: hidden; margin-bottom: 20px;">
                        <video id="remoteVideo" autoplay playsinline style="width: 100%; height: 100%; object-fit: cover;"></video>
                        <video id="localVideo" autoplay playsinline muted style="position: absolute; bottom: 20px; right: 20px; width: 120px; height: 90px; border: 2px solid white; border-radius: 8px; object-fit: cover;"></video>
                    </div>
                    <div class="call-controls">
                        <button id="endCallButton" class="btn btn-danger btn-lg rounded-circle" style="width: 60px; height: 60px; border-radius: 50%; display: flex; align-items: center; justify-content: center;">
                            <i class="fas fa-phone-slash"></i>
                        </button>
                    </div>
                </div>
            `;
            document.body.appendChild(callInterface);

            document.getElementById('endCallButton').addEventListener('click', () => {
                this.endCall();
            });

            return callInterface;
        }

        // Запись аудиосообщения (оставляем старую функциональность)
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

    // Входящий звонок
    window.socket.on('incoming_call', (data) => {
        console.log('📞 Incoming call:', data);
        // data: { fromUserId, signal, withVideo }

        // Можно добавить звук звонка здесь

        const accept = confirm(`Входящий ${data.withVideo ? 'видео' : 'аудио'} звонок. Принять?`);
        if (accept) {
            window.webrtcManager.acceptCall(data);
        } else {
            window.webrtcManager.rejectCall(data.fromUserId);
        }
    });

    // Звонок принят собеседником
    window.socket.on('call_accepted', (data) => {
        console.log('✅ Call accepted:', data);
        // data: { fromUserId, signal }
        window.webrtcManager.handleCallAccepted(data.signal);
    });

    // Звонок отклонен
    window.socket.on('call_rejected', (data) => {
        console.log('❌ Call rejected:', data);
        showError('Собеседник отклонил звонок');
        window.webrtcManager.endCall();
    });

    // Звонок завершен
    window.socket.on('call_ended', (data) => {
        console.log('🛑 Call ended:', data);
        showSuccess('Звонок завершен собеседником');
        window.webrtcManager.endCall();
    });

    // ICE кандидаты (если будем использовать trickle)
    window.socket.on('ice_candidate', (data) => {
        window.webrtcManager.handleIceCandidate(data.candidate);
    });
}

// Глобальные функции для вызова из HTML
window.startAudioCall = function () {
    const targetUserId = window.currentPartnerId;
    if (targetUserId) {
        window.webrtcManager.startCall(targetUserId, false);
    } else {
        showError('Выберите собеседника для звонка');
    }
};

window.startVideoCall = function () {
    const targetUserId = window.currentPartnerId;
    if (targetUserId) {
        window.webrtcManager.startCall(targetUserId, true);
    } else {
        showError('Выберите собеседника для звонка');
    }
};

console.log('✅ WebRTC module loaded');