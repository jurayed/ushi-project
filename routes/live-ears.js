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
  getUserActiveConversations
} = require('../models/conversations');
const { matchUserWithEar } = require('../services/matching');

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

// Найти слушателя и начать сессию
router.post('/conversations/find', authenticateToken, async (req, res) => {
  try {
    const result = await matchUserWithEar(req.user.id);
    
    if (!result.success) {
      return res.status(404).json({ error: result.error });
    }
    
    res.json({
      message: 'Сессия с слушателем начата',
      conversation_id: result.conversation.id,
      ear: result.conversation.ear
    });
  } catch (error) {
    console.error('Ошибка поиска слушателя:', error);
    res.status(500).json({ error: 'Внутренняя ошибка сервера' });
  }
});

// Отправить сообщение в сессию
router.post('/conversations/:id/message', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    const { message } = req.body;
    
    if (!message) {
      return res.status(400).json({ error: 'Сообщение обязательно' });
    }
    
    const result = await addMessage(id, req.user.id, message);
    
    if (!result) {
      return res.status(400).json({ error: 'Ошибка отправки сообщения' });
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