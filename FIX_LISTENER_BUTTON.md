# FIX: "Become Listener" Button Authorization Error

## PROBLEM
Button "Стать слушателем" asks for authorization even when logged in.

## ROOT CAUSE
The socket is NEVER initialized! The function `initializeSocket()` exists but is never called.

## SOLUTION
Add these 2 lines to `public/js/auth.js`:

### Step 1: Add import at top (line 3)
```javascript
// public/js/auth.js
import { showTab, showMainInterface, showAuthInterface, showError, showSuccess } from './ui.js';
import { validateAuthFields, validateRegFields } from './utils.js';
import { initializeSocket } from './socket-client.js';  // ADD THIS LINE
```

### Step 2: Call initializeSocket after successful login (line 26-27)
Find this code around line 22-27:
```javascript
if (response.ok) {
    window.currentToken = data.token;
    window.currentUser = data.user;
    localStorage.setItem('ushi_token', data.token);
    showMainInterface();
    showSuccess('Вход выполнен успешно!');
    initializeSocket();  // ADD THIS LINE
}
```

That's it! Just add these 2 lines and the socket will initialize after login, making the listener button work.

## Why This Fixes It
The `toggleEarRegistration` function checks:
```javascript
if (!window.currentUser || !window.socket) {
    showError('Сначала войдите в систему');
    return;
}
```

Currently `window.socket` is null because `initializeSocket()` is never called.
After the fix, socket will be initialized and the button will work!
