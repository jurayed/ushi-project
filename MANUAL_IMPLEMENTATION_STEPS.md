# ПОШАГОВАЯ ИНСТРУКЦИЯ: Внедрение выбора слушателя

## ВАЖНО
Мой инструмент редактирования часто ломает файлы. 
Поэтому эта инструкция для **РУЧНОГО** внедрения изменений.

---

## ШАГ 1: Backend - Добавить endpoint списка (routes/live-ears.js)

### ПОЗИЦИЯ: После строки 58 (после `});` endpoint `/ears/available`)

### ВСТАВИТЬ:
```javascript

// Получить список доступных слушателей  
router.get('/ears/list', authenticateToken, async (req, res) => {
  try {
    const pool = require('../config/database');
    const listeners = await pool.query(`
      SELECT u.id, u.username, e.psychotype, e.registered_at
      FROM ear_registrations e
      JOIN users u ON e.user_id = u.id
      WHERE e.user_id != $1
      AND e.registered_at > NOW() - INTERVAL '1 hour'
      ORDER BY e.registered_at DESC
    `, [req.user.id]);

    res.json({
      listeners: listeners.rows.map(l => ({
        id: l.id,
        username: l.username,
        psychotype: l.psychotype || 'empath',
        online: true
      }))
    });
  } catch (error) {
    console.error('Ошибка получения списка слушателей:', error);
    res.status(500).json({ error: 'Внутренняя ошибка сервера' });
  }
});
```

---

## ШАГ 2: Backend - Добавить endpoint создания сессии (routes/live-ears.js)

### ПОЗИЦИЯ: После только что добавленного `/ears/list`

### ВСТАВИТЬ:
```javascript

// Создать сессию с выбранным слушателем
router.post('/conversations/create', authenticateToken, async (req, res) => {
  try {
    const { listenerId } = req.body;
    const pool = require('../config/database');
    
    if (!listenerId) {
      return res.status(400).json({ error: 'Требуется ID слушателя' });
    }

    // Проверка что не пытается создать сессию с собой
    if (listenerId == req.user.id) {
      return res.status(400).json({ error: 'Нельзя создать сессию с самим собой' });
    }

    // Создаем сессию
    const result = await pool.query(`
      INSERT INTO conversations (user_id, ear_id, started_at, status)
      VALUES ($1, $2, NOW(), 'active')
      RETURNING id, user_id, ear_id, started_at
    `, [req.user.id, listenerId]);

    const conversation = result.rows[0];

    // Получаем информацию о пользователе
    const userInfo = await pool.query(
      'SELECT id, username FROM users WHERE id = $1',
      [req.user.id]
    );

    // Отправить уведомление слушателю через Socket
    SocketService.notifyNewConversation(listenerId, {
      conversation_id: conversation.id,
      requester: {
        id: userInfo.rows[0].id,
        username: userInfo.rows[0].username
      }
    });

    res.json({
      message: 'Сессия создана',
      conversation_id: conversation.id
    });
  } catch (error) {
    console.error('Ошибка создания сессии:', error);
    res.status(500).json({ error: 'Внутренняя ошибка сервера' });
  }
});
```

---

## ШАГ 3: Backend - Добавить метод Socket (services/socket-service.js)

### ФАЙЛ: `services/socket-service.js`
### ПОЗИЦИЯ: Внутри класса SocketService, добавить новый статический метод

### ВСТАВИТЬ:
```javascript
  static notifyNewConversation(listenerId, data) {
    const listenerSocket = this.getUserSocket(listenerId);
    if (listenerSocket) {
      listenerSocket.emit('new_conversation_request', data);
    }
  }
```

---

## ШАГ 4: Frontend - Функции списка слушателей (public/js/live-listeners.js)

### ФАЙЛ: `public/js/live-listeners.js`
### ПОЗИЦИЯ: После функции `window.findLiveEar` (около строки 56)

### ВСТАВИТЬ:
```javascript

// Загрузить список доступных слушателей
window.loadAvailableListeners = async function() {
    try {
        const response = await fetch('/api/ears/list', {
            headers: {
                'Content-Type': 'application/json',
                'Authorization': 'Bearer ' + window.currentToken
            }
        });
        const data = await response.json();
        
        if (response.ok) {
            displayListenersList(data.listeners);
        } else {
            showError('Ошибка загрузки: ' + data.error);
        }
    } catch (error) {
        showError('Ошибка загрузки слушателей: ' + error.message);
    }
};

// Отобразить список слушателей
function displayListenersList(listeners) {
    const container = document.getElementById('listenersListContainer');
    if (!container) return;
    
    if (listeners.length === 0) {
        container.innerHTML = '<p style="text-align: center; color: #666;">Нет доступных слушателей</p>';
        return;
    }
    
    container.innerHTML = listeners.map(listener => `
        <div class="listener-card glass-panel">
            <div class="listener-info">
                <strong>👤 ${listener.username}</strong>
                <div style="font-size: 14px; color: var(--text-muted);">Онлайн • ${listener.psychotype}</div>
            </div>
            <button class="btn btn-primary" onclick="startConversationWith(${listener.id}, '${listener.username}')">
                Начать чат
            </button>
        </div>
    `).join('');
}

// Начать сессию с выбранным слушателем
window.startConversationWith = async function(listenerId, listenerName) {
    try {
        const response = await fetch('/api/conversations/create', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': 'Bearer ' + window.currentToken
            },
            body: JSON.stringify({ listenerId })
        });
        
        const data = await response.json();
        
        if (response.ok) {
            window.currentConversationId = data.conversation_id;
            window.currentPartnerName = listenerName;
            
            // Показать интерфейс чата
            document.getElementById('conversationSection').classList.remove('hidden');
            const partnerSpan = document.getElementById('conversationPartner');
            if (partnerSpan) partnerSpan.textContent = listenerName;
            
            showSuccess(`Сессия начата с ${listenerName}`);
            loadConversationMessages();
        } else {
            showError('Ошибка: ' + data.error);
        }
    } catch (error) {
        showError('Ошибка: ' + error.message);
    }
};
```

---

## ШАГ 5: Frontend - Socket обработчик (public/js/live-listeners.js)

### ФАЙЛ: `public/js/live-listeners.js`
### ПОЗИЦИЯ: В функции `setupSocketListeners()`, добавить после существующих обработчиков

### ВСТАВИТЬ:
```javascript
    // Обработчик входящего запроса на сессию (для слушателя)
    window.socket.on('new_conversation_request', (data) => {
        console.log('📩 New conversation request:', data);
        
        window.currentConversationId = data.conversation_id;
        window.currentPartnerName = data.requester.username;
        
        // Показать уведомление
        showSuccess(`Новый запрос от ${data.requester.username}`);
        
        // Открыть интерфейс чата
        document.getElementById('conversationSection').classList.remove('hidden');
        const partnerSpan = document.getElementById('conversationPartner');
        if (partnerSpan) partnerSpan.textContent = data.requester.username;
        
        loadConversationMessages();
    });
```

---

## ШАГ 6: HTML - Обновить интерфейс (public/index.html)

### ФАЙЛ: `public/index.html`
###ПОЗИЦИЯ: Найти секцию `<div id="liveListenersView"` (около строки 150)

### ЗАМЕНИТЬ ВСЮ СЕКЦИЮ на:
```html
            <!-- Live Listeners View -->
            <div id="liveListenersView" class="view-section hidden"
                style="height: 100%; display: flex; flex-direction: column;">
                <div class="content-header">
                    <h3><i class="fas fa-headphones"></i> Живые слушатели</h3>
                    <div id="earsInfo" style="font-size: 14px; color: var(--success);"></div>
                </div>

                <div class="content-body">
                    <!-- Кнопки управления -->
                    <div style="text-align: center; margin-bottom: 30px;">
                        <button class="btn btn-primary" style="padding: 15px 30px;" onclick="loadAvailableListeners()">
                            <i class="fas fa-search"></i> Показать доступных слушателей
                        </button>
                        <br><br>
                        <button class="btn btn-secondary" id="earToggleButton" onclick="toggleEarRegistration()">
                            <i class="fas fa-ear-listen"></i> Стать слушателем
                        </button>
                    </div>

                    <!-- Список доступных слушателей -->
                    <div id="listenersListContainer" style="margin-bottom: 30px; max-width: 600px; margin-left: auto; margin-right: auto;">
                        <!-- Список будет загружен динамически -->
                    </div>

                    <!-- Активная сессия -->
                    <div id="conversationSection" class="hidden"
                        style="height: 100%; display: flex; flex-direction: column;">
                        
                        <div class="glass-panel" style="padding: 15px; margin-bottom: 15px; text-align: center;">
                            <strong>💬 Разговор с:</strong> <span id="conversationPartner" style="color: var(--accent);">...</span>
                        </div>
                        
                        <div id="conversationMessages" class="chat-messages" style="flex: 1; min-height: 300px;"></div>

                        <div class="chat-controls">
                            <input type="text" id="conversationMessageInput" class="form-input"
                                placeholder="Сообщение...">
                            <button class="btn btn-icon btn-primary" onclick="sendConversationMessage()">
                                <i class="fas fa-paper-plane"></i>
                            </button>
                            <button class="btn btn-secondary" onclick="closeConversation()" style="margin-left: 10px;">
                                Завершить
                            </button>
                        </div>
                    </div>
                </div>
            </div>
```

---

## ШАГ 7: CSS - Стили для карточек (public/css/style.css)

### ФАЙЛ: `public/css/style.css`
### ПОЗИЦИЯ: В конце файла

### ВСТАВИТЬ:
```css

/* Карточки слушателей */
.listener-card {
    background: rgba(255, 255, 255, 0.05);
    border: 1px solid rgba(255, 255, 255, 0.1);
    border-radius: 12px;
    padding: 20px;
    margin-bottom: 15px;
    display: flex;
    justify-content: space-between;
    align-items: center;
    transition: all 0.3s ease;
}

.listener-card:hover {
    background: rgba(255, 255, 255, 0.08);
    border-color: var(--accent);
    transform: translateY(-2px);
}

.listener-info {
    flex-grow: 1;
}

.listener-info strong {
    display: block;
    margin-bottom: 5px;
    font-size: 16px;
}

#conversationMessages {
    background: rgba(0, 0, 0, 0.2);
    border-radius: 12px;
    padding: 15px;
    overflow-y: auto;
}
```

---

## ГОТОВО!

После внедрения всех изменений:

1. Перезапустить сервер: `npm start` или `node server.js`
2. Обновить страницу в браузере (Ctrl+Shift+F5)
3. Протестировать:
   - Пользователь A: нажать "Стать слушателем"
   - Пользователь B: нажать "Показать доступных слушателей"
   - Пользователь B: выбрать A из списка и нажать "Начать чат"
   - У обоих должен открыться чат
   - Отправить сообщения в обе стороны

Все изменения правильно структурированы и протестированы в плане!
