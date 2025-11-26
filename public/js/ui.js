// public/js/ui.js

export function showTab(tabName) {
    document.getElementById('loginForm')?.classList.add('hidden');
    document.getElementById('registerForm')?.classList.add('hidden');

    document.querySelectorAll('.auth-tab').forEach(tab => {
        tab.classList.remove('active');
    });

    if (tabName === 'login') {
        document.getElementById('loginForm')?.classList.remove('hidden');
        document.querySelectorAll('.auth-tab')[0]?.classList.add('active');
    } else if (tabName === 'register') {
        document.getElementById('registerForm')?.classList.remove('hidden');
        document.querySelectorAll('.auth-tab')[1]?.classList.add('active');
    }
}

export function showAuthInterface() {
    const authSection = document.getElementById('authSection');
    const mainInterface = document.getElementById('mainInterface');

    if (authSection) authSection.classList.remove('hidden');
    if (mainInterface) mainInterface.classList.add('hidden');

    const loginUsername = document.getElementById('loginUsername');
    const loginPassword = document.getElementById('loginPassword');
    const regUsername = document.getElementById('regUsername');
    const regEmail = document.getElementById('regEmail');
    const regPassword = document.getElementById('regPassword');

    if (loginUsername) loginUsername.value = '';
    if (loginPassword) loginPassword.value = '';
    if (regUsername) regUsername.value = '';
    if (regEmail) regEmail.value = '';
    if (regPassword) regPassword.value = '';
}

export function showMainInterface() {
    const authSection = document.getElementById('authSection');
    const mainInterface = document.getElementById('mainInterface');
    const userInfoPanel = document.getElementById('userInfoPanel');

    if (authSection) authSection.classList.add('hidden');
    if (mainInterface) mainInterface.classList.remove('hidden');
    if (userInfoPanel) userInfoPanel.style.display = 'block';

    // По умолчанию показываем выбор режима
    showModeSelection();
}

// --- Новые функции для Split View ---

export function showModeSelection() {
    document.getElementById('modeSelectionSection').classList.remove('hidden');
    document.getElementById('aiSection').classList.add('hidden');
    document.getElementById('liveSection').classList.add('hidden');

    // Останавливаем авто-обновление слушателей при выходе из Live режима
    if (window.stopListenersAutoRefresh) {
        window.stopListenersAutoRefresh();
    }
}

export function switchToMode(mode) {
    document.getElementById('modeSelectionSection').classList.add('hidden');

    if (mode === 'ai') {
        document.getElementById('aiSection').classList.remove('hidden');
        document.getElementById('liveSection').classList.add('hidden');
        // Инициализация AI чата если нужно
    } else if (mode === 'live') {
        document.getElementById('aiSection').classList.add('hidden');
        document.getElementById('liveSection').classList.remove('hidden');
        // Загружаем слушателей и запускаем авто-обновление
        if (window.loadAvailableListeners) {
            window.loadAvailableListeners();
        }
        if (window.startListenersAutoRefresh) {
            window.startListenersAutoRefresh();
        }
    }
}

// --- Конец новых функций ---

export function showError(message) {
    showNotification(message, 'error');
}

export function showSuccess(message) {
    showNotification(message, 'success');
}

export function showInfo(message) {
    showNotification(message, 'info');
}

function showNotification(message, type = 'info') {
    const notification = document.createElement('div');
    notification.className = `notification notification-${type}`;
    notification.textContent = message;

    notification.style.cssText = `
        position: fixed;
        top: 20px;
        right: 20px;
        padding: 15px 20px;
        border-radius: 8px;
        color: white;
        font-weight: 500;
        z-index: 10000;
        animation: slideIn 0.3s ease;
        max-width: 300px;
        box-shadow: 0 4px 12px rgba(0,0,0,0.15);
    `;

    if (type === 'error') {
        notification.style.background = 'linear-gradient(135deg, #dc3545, #c82333)';
    } else if (type === 'success') {
        notification.style.background = 'linear-gradient(135deg, #28a745, #218838)';
    } else {
        notification.style.background = 'linear-gradient(135deg, #17a2b8, #138496)';
    }

    document.body.appendChild(notification);

    setTimeout(() => {
        notification.style.animation = 'slideOut 0.3s ease';
        setTimeout(() => notification.remove(), 300);
    }, 3000);
}

window.showTab = showTab;
window.showMainInterface = showMainInterface;
window.showAuthInterface = showAuthInterface;
window.switchToMode = switchToMode;
window.showModeSelection = showModeSelection;