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
}

export function switchView(viewName) {
    document.querySelectorAll('.view-section').forEach(el => el.classList.add('hidden'));
    document.querySelectorAll('.nav-item').forEach(el => el.classList.remove('active'));

    if (viewName === 'ai-chat') {
        const aiChatView = document.getElementById('aiChatView');
        if (aiChatView) aiChatView.classList.remove('hidden');
        document.querySelector('.nav-item:nth-child(1)')?.classList.add('active');
    } else if (viewName === 'live-listeners') {
        const liveListenersView = document.getElementById('liveListenersView');
        if (liveListenersView) liveListenersView.classList.remove('hidden');
        document.querySelector('.nav-item:nth-child(2)')?.classList.add('active');
    } else if (viewName === 'profile') {
        const profileView = document.getElementById('profileView');
        if (profileView) {
            profileView.classList.remove('hidden');
        } else {
            showInfo('Profile page coming soon!');
        }
        document.querySelector('.nav-item:nth-child(3)')?.classList.add('active');
    }
}

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

window.switchView = switchView;
window.showTab = showTab;
window.showMainInterface = showMainInterface;
window.showAuthInterface = showAuthInterface;