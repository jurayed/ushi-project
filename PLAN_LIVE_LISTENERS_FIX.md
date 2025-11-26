# ПЛАН: Исправление системы "Живые слушатели"

## ТЕКУЩИЕ ПРОБЛЕМЫ
1. ❌ Не видно, кто доступен как слушатель
2. ❌ Автоматическое сопоставление без выбора
3. ❌ Сессия может начаться с самим собой
4. ❌ Сообщения не отображаются
5. ❌ Сессия не появляется у обоих участников

## ТРЕБУЕМАЯ ФУНКЦИОНАЛЬНОСТЬ

### 1. Список доступных слушателей
**ЧТО:** Показать список пользователей, которые активны как слушатели
**ГДЕ:** В разделе "Живые слушатели"

**UI должен показывать:**
```
Доступные слушатели:
┌─────────────────────────────┐
│ 👤 Username1                │
│    Онлайн • Эмпат           │
│    [Начать чат]             │
├─────────────────────────────┤
│ 👤 Username2                │
│    Онлайн • Оптимист        │
│    [Начать чат]             │
└─────────────────────────────┘
```

### 2. Архитектура сессии

```
Пользователь A (нуждается в помощи)
              ↓
    [Выбирает слушателя B]
              ↓
    Socket: create_conversation
              ↓
         ┌─────────┐
         │ Backend │
         └─────────┘
              ↓
    ┌──────────────────┐
    │                  │
    ↓                  ↓
У A открывается    У B всплывает
окно чата          уведомление
                   + окно чата
```

## НЕОБХОДИМЫЕ ИЗМЕНЕНИЯ

### BACKEND

#### 1. Новый endpoint: GET /api/ears/list
**Файл:** `routes/live-ears.js`
**Добавить после строки 50:**

```javascript
// Получить список активных слушателей
router.get('/ears/list', authenticateToken, async (req, res) => {
  try {
    const listeners = await pool.query(`
      SELECT u.id, u.username, e.psychotype, e.registered_at
      FROM ear_registrations e
      JOIN users u ON e.user_id = u.id
      WHERE e.user_id != $1
      AND e.registered_at > NOW() - INTERVAL '1 hour'
      ORDER BY e.registered_at DESC
    `, [req.user.id]); // Исключаем самого пользователя!

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

#### 2. Изменить endpoint: POST /conversations/find
**Файл:** `routes/live-ears.js` строка 61
**Изменить на:**

```javascript
router.post('/conversations/create', authenticateToken, async (req, res) => {
  try {
    const { listenerId } = req.body;
    
    if (!listenerId) {
      return res.status(400).json({ error: 'Требуется ID слушателя' });
    }

    // Проверка что не пытается создать сессию с собой
    if (listenerId == req.user.id) {
      return res.status(400).json({ error: 'Нельзя создать сессию с самим собой' });
    }

    const result = await pool.query(`
      INSERT INTO conversations (user_id, ear_id, started_at, status)
      VALUES ($1, $2, NOW(), 'active')
      RETURNING id, user_id, ear_id, started_at
    `, [req.user.id, listenerId]);

    const conversation = result.rows[0];

    // Отправить уведомление слушателю через Socket
    SocketService.notifyNewConversation(listenerId, {
      conversation_id: conversation.id,
      requester: {
        id: req.user.id,
        username: req.user.username
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

#### 3. Socket события
**Файл:** `services/socket-service.js`
**Добавить метод:**

```javascript
static notifyNewConversation(listenerId, data) {
  const listenerSocket = this.getUserSocket(listenerId);
  if (listenerSocket) {
    listenerSocket.emit('new_conversation_request', data);
  }
}
```

### FRONTEND

#### 1. Загрузка списка слушателей
**Файл:** `public/js/live-listeners.js`
**Добавить функцию:**

```javascript
window.loadAvailableListeners = async function() {
    try {
        const response = await fetch('/api/ears/list', {
            headers: {
                'Authorization': 'Bearer ' + window.currentToken
            }
        });
        const data = await response.json();
        
        if (response.ok) {
            displayListenersList(data.listeners);
        }
    } catch (error) {
        showError('Ошибка загрузки слушателей: ' + error.message);
    }
};

function displayListenersList(listeners) {
    const container = document.getElementById('listenersListContainer');
    if (!container) return;
    
    if (listeners.length === 0) {
        container.innerHTML = '<p>Нет доступных слушателей</p>';
        return;
    }
    
    container.innerHTML = listeners.map(listener => `
        <div class="listener-card">
            <div class="listener-info">
                <strong>👤 ${listener.username}</strong>
                <div>Онлайн • ${listener.psychotype}</div>
            </div>
            <button class="btn btn-primary" onclick="startConversationWith(${listener.id}, '${listener.username}')">
                Начать чат
            </button>
        </div>
    `).join('');
}
```

#### 2. Начать сессию с выбранным слушателем
**Изменить функцию `findLiveEar`:**

```javascript
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
            window.currentListenerName = listenerName;
            
            // Показать интерфейс чата
            document.getElementById('conversationSection').classList.remove('hidden');
            document.getElementById('conversationPartner').textContent = listenerName;
            
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

#### 3. Socket обработчик для слушателя
**Добавить в setupSocketListeners:**

```javascript
window.socket.on('new_conversation_request', (data) => {
    window.currentConversationId = data.conversation_id;
    window.currentRequesterName = data.requester.username;
    
    // Показать уведомление и открыть чат
    showSuccess(`Новый запрос от ${data.requester.username}`);
    
    document.getElementById('conversationSection').classList.remove('hidden');
    document.getElementById('conversationPartner').textContent = data.requester.username;
    
    loadConversationMessages();
});
```

#### 4. Отображение отправленных сообщений
**Исправить в sendConversationMessage:**

Сообщения уже правильно отображаются в функции на строке 77-82:
```javascript
appendMessage({
    sender_id: window.currentUser.id,
    message_text: message,
    sent_at: new Date().toISOString()
}, true);
```

НО нужно убедиться что оно также отправляется через Socket второму участнику!

### HTML ИЗМЕНЕНИЯ

**Файл:** `public/index.html`
**Заменить раздел Live Listeners (около строки 150):**

```html
<div id="liveListenersView" class="view-section hidden">
    <div class="content-header">
        <h3><i class="fas fa-headphones"></i> Живые слушатели</h3>
    </div>

    <div class="content-body">
        <!-- Кнопки управления -->
        <div style="text-align: center; margin-bottom: 30px;">
            <button class="btn btn-primary" onclick="loadAvailableListeners()">
                <i class="fas fa-search"></i> Показать доступных слушателей
            </button>
            <button class="btn btn-secondary" id="earToggleButton" onclick="toggleEarRegistration()">
                <i class="fas fa-ear-listen"></i> Стать слушателем
            </button>
        </div>

        <!-- Список доступных слушателей -->
        <div id="listenersListContainer" style="margin-bottom: 30px;">
            <!-- Список будет загружен динамически -->
        </div>

        <!-- Активная сессия -->
        <div id="conversationSection" class="hidden">
            <div style="background: #f0f0f0; padding: 10px; margin-bottom: 10px; border-radius: 8px;">
                <strong>Разговор с:</strong> <span id="conversationPartner">...</span>
            </div>
            
            <div id="conversationMessages" class="chat-messages" style="height: 300px; overflow-y: auto; border: 1px solid #ccc; padding: 10px; margin-bottom: 10px;"></div>

            <div class="chat-controls">
                <input type="text" id="conversationMessageInput" class="form-input" placeholder="Сообщение...">
                <button class="btn btn-icon btn-primary" onclick="sendConversationMessage()">
                    <i class="fas fa-paper-plane"></i>
                </button>
                <button class="btn btn-secondary" onclick="closeConversation()">
                    Завершить
                </button>
            </div>
        </div>
    </div>
</div>
```

## ПОРЯДОК ВНЕДРЕНИЯ

1. ✅ Создать endpoint `/api/ears/list` в backend
2. ✅ Изменить `/conversations/find` на `/conversations/create` с параметром listenerId  
3. ✅ Добавить Socket событие `new_conversation_request`
4. ✅ Создать UI для списка слушателей
5. ✅ Добавить функцию `startConversationWith()`
6. ✅ Добавить Socket обработчик у слушателя
7. ✅ Обновить HTML интерфейс

## ТЕСТИРОВАНИЕ

1. Пользователь A регистрируется как слушатель
2. Пользователь B заходит в "Живые слушатели"
3. B нажимает "Показать доступных слушателей"
4. B видит A в списке
5. B нажимает "Начать чат" рядом с A
6. У B открывается окно чата
7. У A всплывает уведомление и открывается чат
8. Оба могут писать сообщения
9. Сообщения появляются у обоих

## CSS для карточек слушателей

**Добавить в `public/css/style.css`:**

```css
.listener-card {
    background: white;
    border: 1px solid #e0e0e0;
    border-radius: 8px;
    padding: 15px;
    margin-bottom: 10px;
    display: flex;
    justify-content: space-between;
    align-items: center;
}

.listener-info {
    flex-grow: 1;
}

.listener-info strong {
    display: block;
    margin-bottom: 5px;
}

.listener-info div {
    font-size: 14px;
    color: #666;
}
```

Это полный план! Нужно внедрить все изменения по порядку.
