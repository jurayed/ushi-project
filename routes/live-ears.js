const express = require('express');
const router = express.Router();
const { authenticateToken } = require('../middleware/auth');
const { pool } = require('../models/database');
const SocketService = require('../services/socket-service');

// Импортируем функции моделей
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

// ==================== УПРАВЛЕНИЕ СТАТУСОМ "УШЕЙ" ====================

// Стать слушателем
router.post('/ears/register', authenticateToken, async (req, res) => {
  try {
    const result = await registerAsEar(req.user.id);
    if (result.error) return res.status(400).json({ error: result.error });
    res.json(result);
  } catch (error) {
    console.error('Registration Error:', error);
    res.status(500).json({ error: 'Server Error' });
  }
});

// Перестать быть слушателем
router.post('/ears/unregister', authenticateToken, async (req, res) => {
  try {
    const result = await unregisterAsEar(req.user.id);
    if (result.error) return res.status(400).json({ error: result.error });
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: 'Server Error' });
  }
});

// Счетчик доступных
router.get('/ears/available', authenticateToken, async (req, res) => {
  try {
    const count = await getAvailableEarsCount();
    res.json({ available_ears: count });
  } catch (error) {
    res.status(500).json({ error: 'Server Error' });
  }
});

// Список слушателей (С фильтрацией себя)
router.get('/ears/list', authenticateToken, async (req, res) => {
  try {
    const query = `
      SELECT u.id, u.username, e.updated_at, e.id as ear_id
      FROM ears e
      JOIN users u ON e.user_id = u.id
      WHERE e.user_id != $1 AND e.is_available = true
      ORDER BY e.updated_at DESC
    `;
    const listeners = await pool.query(query, [req.user.id]);

    res.json({
      listeners: listeners.rows.map(l => ({
        id: l.ear_id,
        userId: l.id,
        username: l.username,
        psychotype: 'empath', // Заглушка, можно брать из базы если будет поле
        online: true
      }))
    });
  } catch (error) {
    console.error('List Error:', error);
    res.status(500).json({ error: 'Server Error' });
  }
});

// ==================== УПРАВЛЕНИЕ СЕССИЯМИ ====================

// Создать чат
router.post('/conversations/create', authenticateToken, async (req, res) => {
  try {
    const { listenerId } = req.body; // listenerId = ear_id
    if (!listenerId) return res.status(400).json({ error: 'No listener ID provided' });

    // Проверяем слушателя и сразу берем его user_id
    const earCheck = await pool.query('SELECT user_id FROM ears WHERE id = $1', [listenerId]);
    
    if (earCheck.rows.length === 0) return res.status(404).json({ error: 'Listener not found' });
    const listenerUserId = earCheck.rows[0].user_id;

    if (listenerUserId === req.user.id) {
      return res.status(400).json({ error: 'Cannot chat with yourself' });
    }

    // Создаем запись разговора
    const result = await pool.query(`
      INSERT INTO conversations (user_id, ear_id, status)
      VALUES ($1, $2, 'active')
      RETURNING id, user_id, ear_id, created_at
    `, [req.user.id, listenerId]);

    const conversation = result.rows[0];

    // Получаем инфо о заказчике для уведомления
    const requesterInfo = await pool.query('SELECT username FROM users WHERE id = $1', [req.user.id]);

    // Уведомляем слушателя через сокет
    SocketService.notifyNewConversation(listenerUserId, {
      conversation_id: conversation.id,
      requester: {
        id: req.user.id,
        username: requesterInfo.rows[0].username
      }
    });

    res.json({ message: 'Session created', conversation_id: conversation.id });
  } catch (error) {
    console.error('Create Session Error:', error);
    res.status(500).json({ error: 'Server Error' });
  }
});

// Отправить сообщение
router.post('/conversations/:id/message', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    const { message, media_url, media_type } = req.body;

    if (!message && !media_url) return res.status(400).json({ error: 'Empty message' });

    // Сохраняем в БД
    const savedMsg = await addMessage(id, req.user.id, message || '[Вложение]', media_url, media_type);
    if (!savedMsg) return res.status(400).json({ error: 'Failed to save message' });

    // Логика определения получателя для сокетов
    const conversation = await getConversationById(id);
    if (conversation) {
      let recipientId = null;

      if (conversation.user_id === req.user.id) {
        // Если отправил клиент -> получатель слушатель
        // Нам нужно найти user_id по ear_id
        const ear = await pool.query('SELECT user_id FROM ears WHERE id = $1', [conversation.ear_id]);
        if (ear.rows.length > 0) recipientId = ear.rows[0].user_id;
      } else {
        // Если отправил слушатель -> получатель клиент
        recipientId = conversation.user_id;
      }

      if (recipientId) {
        await SocketService.emitToUser(recipientId, 'new_message', savedMsg);
      }
    }

    res.json({ success: true, message: savedMsg });
  } catch (error) {
    console.error('Send Message Error:', error);
    res.status(500).json({ error: 'Server Error' });
  }
});

// Получить историю сообщений
router.get('/conversations/:id/messages', authenticateToken, async (req, res) => {
  try {
    const result = await getConversationMessages(req.params.id, req.user.id);
    if (result.error) return res.status(404).json({ error: result.error });
    res.json(result.messages);
  } catch (error) {
    res.status(500).json({ error: 'Server Error' });
  }
});

// Закрыть чат
router.post('/conversations/:id/close', authenticateToken, async (req, res) => {
  try {
    const result = await closeConversation(req.params.id, req.user.id);
    if (result.error) return res.status(404).json({ error: result.error });
    res.json({ message: result.message });
  } catch (error) {
    res.status(500).json({ error: 'Server Error' });
  }
});

// Активные чаты
router.get('/conversations/active', authenticateToken, async (req, res) => {
  try {
    const conversations = await getUserActiveConversations(req.user.id);
    res.json(conversations);
  } catch (error) {
    res.status(500).json({ error: 'Server Error' });
  }
});

module.exports = router;
