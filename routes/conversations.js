const { pool } = require('./database');

// Зарегистрироваться как слушатель
async function registerAsEar(req, res) {
  try {
    const userId = req.user.id;

    // Проверяем, не зарегистрирован ли уже пользователь как слушатель
    const existingEar = await pool.query(
      'SELECT * FROM ears WHERE user_id = $1',
      [userId]
    );

    if (existingEar.rows.length > 0) {
      return res.status(400).json({ error: 'Вы уже зарегистрированы как слушатель' });
    }

    // Регистрируем как слушателя
    await pool.query(
      'INSERT INTO ears (user_id, is_available) VALUES ($1, $2)',
      [userId, true]
    );

    res.json({ message: 'Вы успешно зарегистрированы как слушатель' });
  } catch (error) {
    console.error('Ошибка регистрации слушателя:', error);
    res.status(500).json({ error: 'Внутренняя ошибка сервера' });
  }
}

// Удалить себя из слушателей
async function unregisterAsEar(req, res) {
  try {
    const userId = req.user.id;

    await pool.query(
      'DELETE FROM ears WHERE user_id = $1',
      [userId]
    );

    res.json({ message: 'Вы удалены из слушателей' });
  } catch (error) {
    console.error('Ошибка удаления слушателя:', error);
    res.status(500).json({ error: 'Внутренняя ошибка сервера' });
  }
}

// Получить количество доступных слушателей
async function getAvailableEars(req, res) {
  try {
    const result = await pool.query(
      'SELECT COUNT(*) FROM ears WHERE is_available = true'
    );

    const count = parseInt(result.rows[0].count);

    res.json({ available_ears: count });
  } catch (error) {
    console.error('Ошибка получения количества слушателей:', error);
    res.status(500).json({ error: 'Внутренняя ошибка сервера' });
  }
}

// Найти свободного слушателя и начать сессию
async function findEar(req, res) {
  try {
    const userId = req.user.id;

    // Ищем доступного слушателя
    const availableEars = await pool.query(
      'SELECT * FROM ears WHERE is_available = true AND user_id != $1 LIMIT 1',
      [userId]
    );

    if (availableEars.rows.length === 0) {
      return res.status(404).json({ error: 'Нет доступных слушателей' });
    }

    const ear = availableEars.rows[0];

    // Помечаем слушателя как занятого
    await pool.query(
      'UPDATE ears SET is_available = false WHERE id = $1',
      [ear.id]
    );

    // Создаем сессию
    const conversation = await pool.query(
      'INSERT INTO conversations (user_id, ear_id) VALUES ($1, $2) RETURNING *',
      [userId, ear.id]
    );

    res.json({
      conversation_id: conversation.rows[0].id,
      ear_id: ear.user_id, // ID пользователя-слушателя
      message: 'Сессия начата'
    });
  } catch (error) {
    console.error('Ошибка поиска слушателя:', error);
    res.status(500).json({ error: 'Внутренняя ошибка сервера' });
  }
}

// Отправить сообщение в сессию
async function sendMessage(req, res) {
  try {
    const { id: conversationId } = req.params;
    const { message } = req.body;
    const userId = req.user.id;

    if (!message) {
      return res.status(400).json({ error: 'Сообщение обязательно' });
    }

    // Проверяем, существует ли сессия и имеет ли пользователь к ней доступ
    const conversation = await pool.query(
      'SELECT * FROM conversations WHERE id = $1 AND (user_id = $2 OR ear_id = $2)',
      [conversationId, userId]
    );

    if (conversation.rows.length === 0) {
      return res.status(404).json({ error: 'Сессия не найдена' });
    }

    // Добавляем сообщение
    await pool.query(
      'INSERT INTO conversation_messages (conversation_id, sender_id, message_text) VALUES ($1, $2, $3)',
      [conversationId, userId, message]
    );

    res.json({ success: true });
  } catch (error) {
    console.error('Ошибка отправки сообщения:', error);
    res.status(500).json({ error: 'Внутренняя ошибка сервера' });
  }
}

// Получить историю сообщений сессии
async function getConversationMessages(req, res) {
  try {
    const { id: conversationId } = req.params;
    const userId = req.user.id;

    // Проверяем, существует ли сессия и имеет ли пользователь к ней доступ
    const conversation = await pool.query(
      'SELECT * FROM conversations WHERE id = $1 AND (user_id = $2 OR ear_id = $2)',
      [conversationId, userId]
    );

    if (conversation.rows.length === 0) {
      return res.status(404).json({ error: 'Сессия не найдена' });
    }

    // Получаем сообщения
    const messages = await pool.query(
      `SELECT cm.*, u.username 
       FROM conversation_messages cm 
       JOIN users u ON cm.sender_id = u.id 
       WHERE conversation_id = $1 
       ORDER BY sent_at ASC`,
      [conversationId]
    );

    res.json(messages.rows);
  } catch (error) {
    console.error('Ошибка получения сообщений:', error);
    res.status(500).json({ error: 'Внутренняя ошибка сервера' });
  }
}

// Закрыть сессию
async function closeConversation(req, res) {
  try {
    const { id: conversationId } = req.params;
    const userId = req.user.id;

    // Проверяем, существует ли сессия и имеет ли пользователь к ней доступ
    const conversation = await pool.query(
      'SELECT * FROM conversations WHERE id = $1 AND (user_id = $2 OR ear_id = $2)',
      [conversationId, userId]
    );

    if (conversation.rows.length === 0) {
      return res.status(404).json({ error: 'Сессия не найдена' });
    }

    // Закрываем сессию
    await pool.query(
      'UPDATE conversations SET status = $1, ended_at = NOW() WHERE id = $2',
      ['closed', conversationId]
    );

    // Освобождаем слушателя
    await pool.query(
      'UPDATE ears SET is_available = true WHERE id = $1',
      [conversation.rows[0].ear_id]
    );

    res.json({ message: 'Сессия закрыта' });
  } catch (error) {
    console.error('Ошибка закрытия сессии:', error);
    res.status(500).json({ error: 'Внутренняя ошибка сервера' });
  }
}

module.exports = {
  registerAsEar,
  unregisterAsEar,
  getAvailableEars,
  findEar,
  sendMessage,
  getConversationMessages,
  closeConversation
};