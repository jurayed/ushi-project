// public/js/ui.js

// === ФУНКЦИИ УВЕДОМЛЕНИЙ ===

function showNotification(message, type = 'info') {
    const notification = document.createElement('div');
    notification.className = `notification notification-${type}`;
    notification.textContent = message;
    
    // Стили
    notification.style.cssText = `
        position: fixed; top: 20px; right: 20px; padding: 15px 25px;
        border-radius: 8px; color: white; font-weight: 500; z-index: 10000;
        animation: slideIn 0.3s ease; max-width: 300px;
        box-shadow: 0 5px 15px rgba(0,0,0,0.3);
    `;

    const colors = {
        error: 'linear-gradient(135deg, #dc3545, #c82333)',
        success: 'linear-gradient(135deg, #28a745, #218838)',
        info: 'linear-gradient(135deg, #17a2b8, #138496)'
    };
    notification.style.background = colors[type] || colors.info;

    document.body.appendChild(notification);

    setTimeout(() => {
        notification.style.opacity = '0';
        notification.style.transition = 'opacity 0.3s';
        setTimeout(() => notification.remove(), 300);
    }, 3000);
}

// Экспортируем функции явно
export function showError(msg) { showNotification(msg, 'error'); }
export function showSuccess(msg) { showNotification(msg, 'success'); }
export function showInfo(msg) { showNotification(msg, 'info'); }

// === ФУНКЦИИ ИНТЕРФЕЙСА ===

export function showTab(tabName) {
    const loginForm = document.getElementById('loginForm');
    const regForm = document.getElementById('registerForm');
    
    if (!loginForm || !regForm) return;

    document.querySelectorAll('.auth-tab').forEach(t => t.classList.remove('active'));

    if (tabName === 'login') {
        loginForm.classList.remove('hidden');
        regForm.classList.add('hidden');
        document.querySelectorAll('.auth-tab')[0]?.classList.add('active');
    } else {
        loginForm.classList.add('hidden');
        regForm.classList.remove('hidden');
        document.querySelectorAll('.auth-tab')[1]?.classList.add('active');
    }
}

export function showAuthInterface() {
    document.getElementById('authSection')?.classList.remove('hidden');
    document.getElementById('mainInterface')?.classList.add('hidden');
    
    // Очистка полей
    ['loginUsername', 'loginPassword', 'regUsername', 'regEmail', 'regPassword']
        .forEach(id => { 
            const el = document.getElementById(id); 
            if(el) el.value = ''; 
        });
}

export function showMainInterface() {
    document.getElementById('authSection')?.classList.add('hidden');
    document.getElementById('mainInterface')?.classList.remove('hidden');
    const userInfoPanel = document.getElementById('userInfoPanel');
    if (userInfoPanel) userInfoPanel.style.display = 'block';
    
    showModeSelection();
}

export function showModeSelection() {
    document.getElementById('modeSelectionSection')?.classList.remove('hidden');
    document.getElementById('aiSection')?.classList.add('hidden');
    document.getElementById('liveSection')?.classList.add('hidden');
}

export function switchToMode(mode) {
    document.getElementById('modeSelectionSection')?.classList.add('hidden');

    if (mode === 'ai') {
        document.getElementById('aiSection')?.classList.remove('hidden');
        document.getElementById('liveSection')?.classList.add('hidden');
        // Загружаем провайдеры если доступны в глобальной области
        if (window.loadProviders) window.loadProviders();
        if (window.loadChatHistory) window.loadChatHistory();
    } else if (mode === 'live') {
        document.getElementById('aiSection')?.classList.add('hidden');
        document.getElementById('liveSection')?.classList.remove('hidden');
        if (window.loadAvailableListeners) window.loadAvailableListeners();
    }
}

export function toggleAiSettings(show) {
    const modal = document.getElementById('aiSettingsModal');
    if (show) modal.classList.remove('hidden');
    else modal.classList.add('hidden');
}

// === ВАЖНО: ПРИВЯЗКА К ОКНУ (ЧТОБЫ РАБОТАЛ HTML onclick) ===
window.showTab = showTab;
window.switchToMode = switchToMode;
window.showModeSelection = showModeSelection;
window.toggleAiSettings = toggleAiSettings;
window.showError = showError;
window.showSuccess = showSuccess;

console.log('✅ UI Module Loaded');
