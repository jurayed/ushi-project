const express = require('express');
const router = express.Router();
const { authenticateToken } = require('../middleware/auth');
const {
  registerAsEar,
  unregisterAsEar,
  getAvailableEarsCount,
  addMessage,
  getConversationMessages,
  closeConversation,
  getUserActiveConversations,
  getConversationById
} = require('../models/conversations');
const { pool } = require('../models/database');
const { matchUserWithEar } = require('../services/matching');
const SocketService = require('../services/socket-service');

// Зарегистрироваться как слушатель
router.post('/ears/register', authenticateToken, async (req, res) => {
  try {
    const result = await registerAsEar(req.user.id);

    if (result.error) {
      return res.status(400).json({ error: result.error });
    }

    res.json(result);
  } catch (error) {
    console.error('Ошибка регистрации слушателя:', error);
    res.status(500).json({ error: 'Внутренняя ошибка сервера' });
  }
});

// Удалить себя из слушателей
router.post('/ears/unregister', authenticateToken, async (req, res) => {
  try {
    const result = await unregisterAsEar(req.user.id);

    if (result.error) {
      return res.status(400).json({ error: result.error });
    }

    res.json(result);
  } catch (error) {
    console.error('Ошибка удаления слушателя:', error);
    res.status(500).json({ error: 'Внутренняя ошибка сервера' });
  }
});

// Получить количество доступных слушателей
router.get('/ears/available', authenticateToken, async (req, res) => {
  try {
    const count = await getAvailableEarsCount();
    res.json({ available_ears: count });
  } catch (error) {
    console.error('Ошибка получения количества слушателей:', error);
    res.status(500).json({ error: 'Внутренняя ошибка сервера' });
  }
});

// Получить список доступных слушателей
router.get('/ears/list', authenticateToken, async (req, res) => {
  try {
    const listeners = await pool.query(`
      SELECT u.id, u.username, e.updated_at as registered_at, e.id as ear_id
      FROM ears e
      JOIN users u ON e.user_id = u.id
      WHERE e.user_id != $1
      AND e.is_available = true
      ORDER BY e.updated_at DESC
    `, [req.user.id]);

    res.json({
      listeners: listeners.rows.map(l => ({
        id: l.ear_id,
        userId: l.id,
        username: l.username,
        psychotype: 'empath', // Заглушка
        online: true
      }))
    });
  } catch (error) {
    console.error('Ошибка получения списка слушателей:', error);
    res.status(500).json({ error: 'Внутренняя ошибка сервера' });
  }
});

// Создать сессию с выбранным слушателем
router.post('/conversations/create', authenticateToken, async (req, res) => {
  try {
    const { listenerId } = req.body;

    if (!listenerId) {
      return res.status(400).json({ error: 'Требуется ID слушателя' });
    }

    // Проверка что не пытается создать сессию с собой
    // listenerId - это ear_id, нужно получить user_id из таблицы ears
    const earCheck = await pool.query('SELECT user_id FROM ears WHERE id = $1', [listenerId]);

    if (earCheck.rows.length === 0) {
      return res.status(404).json({ error: 'Слушатель не найден' });
    }

    if (earCheck.rows[0].user_id === req.user.id) {
      return res.status(400).json({ error: 'Нельзя создать сессию с самим собой' });
    }

    // Создаем сессию (используем created_at вместо started_at)
    const result = await pool.query(`
      INSERT INTO conversations (user_id, ear_id, status)
      VALUES ($1, $2, 'active')
      RETURNING id, user_id, ear_id, created_at
    `, [req.user.id, listenerId]);

    const conversation = result.rows[0];

    // Получаем информацию о пользователе для отправки слушателю
    const userInfo = await pool.query(
      'SELECT id, username FROM users WHERE id = $1',
      [req.user.id]
    );

    // Отправить уведомление слушателю через Socket
    // Нам нужно отправить уведомление пользователю, который является слушателем
    SocketService.notifyNewConversation(earCheck.rows[0].user_id, {
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

// Отправить сообщение в сессию
router.post('/conversations/:id/message', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    const { message, media_url, media_type } = req.body;

    if (!message && !media_url) {
      return res.status(400).json({ error: 'Сообщение или медиа обязательно' });
    }

    const result = await addMessage(id, req.user.id, message || '[Голосовое сообщение]', media_url, media_type);

    if (!result) {
      return res.status(400).json({ error: 'Ошибка отправки сообщения' });
    }

    // Отправляем уведомление через сокет
    const conversation = await getConversationById(id);
    if (conversation) {
      // Определяем получателя: если отправитель - пользователь, то получатель - слушатель (его user_id), и наоборот
      // Но conversation.ear_id - это ID из таблицы ears. Нам нужно получить user_id слушателя.

      let recipientId;
      if (conversation.user_id === req.user.id) {
        // Отправил пользователь, получатель - слушатель
        const ear = await pool.query('SELECT user_id FROM ears WHERE id = $1', [conversation.ear_id]);
        if (ear.rows.length > 0) {
          recipientId = ear.rows[0].user_id;
        }
      } else {
        // Отправил слушатель, получатель - пользователь
        recipientId = conversation.user_id;
      }

      if (recipientId) {
        await SocketService.emitToUser(recipientId, 'new_message', result);
      }
    }

    res.json({ success: true, message: result });
  } catch (error) {
    console.error('Ошибка отправки сообщения:', error);
    res.status(500).json({ error: 'Внутренняя ошибка сервера' });
  }
});

// Получить сообщения сессии
router.get('/conversations/:id/messages', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    const result = await getConversationMessages(id, req.user.id);

    if (result.error) {
      return res.status(404).json({ error: result.error });
    }

    res.json(result.messages);
  } catch (error) {
    console.error('Ошибка получения сообщений:', error);
    res.status(500).json({ error: 'Внутренняя ошибка сервера' });
  }
});

// Закрыть сессию
router.post('/conversations/:id/close', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    const result = await closeConversation(id, req.user.id);

    if (result.error) {
      return res.status(404).json({ error: result.error });
    }

    res.json({ message: result.message });
  } catch (error) {
    console.error('Ошибка закрытия сессии:', error);
    res.status(500).json({ error: 'Внутренняя ошибка сервера' });
  }
});

// Получить активные сессии пользователя
router.get('/conversations/active', authenticateToken, async (req, res) => {
  try {
    const conversations = await getUserActiveConversations(req.user.id);
    res.json(conversations);
  } catch (error) {
    console.error('Ошибка получения активных сессий:', error);
    res.status(500).json({ error: 'Внутренняя ошибка сервера' });
  }
});

module.exports = router;