const { pool } = require('./database');

// Зарегистрироваться как слушатель
async function registerAsEar(userId) {
  try {
    // Проверяем, не зарегистрирован ли уже пользователь как слушатель
    const existingEar = await pool.query(
      'SELECT * FROM ears WHERE user_id = $1',
      [userId]
    );

    if (existingEar.rows.length > 0) {
      return { error: 'Вы уже зарегистрированы как слушатель' };
    }

    // Регистрируем как слушателя
    await pool.query(
      'INSERT INTO ears (user_id, is_available) VALUES ($1, $2)',
      [userId, true]
    );

    return { message: 'Вы успешно зарегистрированы как слушатель' };
  } catch (error) {
    console.error('Ошибка регистрации слушателя:', error);
    return { error: 'Внутренняя ошибка сервера' };
  }
}

// Удалить себя из слушателей
async function unregisterAsEar(userId) {
  try {
    await pool.query(
      'DELETE FROM ears WHERE user_id = $1',
      [userId]
    );

    return { message: 'Вы удалены из слушателей' };
  } catch (error) {
    console.error('Ошибка удаления слушателя:', error);
    return { error: 'Внутренняя ошибка сервера' };
  }
}

// Получить количество доступных слушателей
async function getAvailableEarsCount() {
  try {
    const result = await pool.query(
      'SELECT COUNT(*) FROM ears WHERE is_available = true'
    );
    return parseInt(result.rows[0].count);
  } catch (error) {
    console.error('Ошибка получения количества слушателей:', error);
    return 0;
  }
}

// Найти свободного слушателя
async function findAvailableEar(excludeUserId) {
  try {
    const result = await pool.query(
      `SELECT e.*, u.username 
       FROM ears e 
       JOIN users u ON e.user_id = u.id 
       WHERE e.is_available = true AND e.user_id != $1 
       ORDER BY e.rating DESC, e.sessions_completed ASC 
       LIMIT 1`,
      [excludeUserId]
    );

    return result.rows[0] || null;
  } catch (error) {
    console.error('Ошибка поиска слушателя:', error);
    return null;
  }
}

// Создать новую сессию
async function createConversation(userId, earId) {
  try {
    const result = await pool.query(
      'INSERT INTO conversations (user_id, ear_id) VALUES ($1, $2) RETURNING *',
      [userId, earId]
    );

    // Помечаем слушателя как занятого
    await pool.query(
      'UPDATE ears SET is_available = false WHERE id = $1',
      [earId]
    );

    return result.rows[0];
  } catch (error) {
    console.error('Ошибка создания сессии:', error);
    return null;
  }
}

// Добавить сообщение в сессию
async function addMessage(conversationId, senderId, messageText, mediaUrl = null, mediaType = null) {
  try {
    const result = await pool.query(
      'INSERT INTO conversation_messages (conversation_id, sender_id, message_text, media_url, media_type) VALUES ($1, $2, $3, $4, $5) RETURNING *',
      [conversationId, senderId, messageText, mediaUrl, mediaType]
    );

    return result.rows[0];
  } catch (error) {
    console.error('Ошибка добавления сообщения:', error);
    return null;
  }
}

// Получить сообщения сессии
async function getConversationMessages(conversationId, userId) {
  try {
    // Проверяем, имеет ли пользователь доступ к сессии
    const conversation = await pool.query(
      'SELECT * FROM conversations WHERE id = $1 AND (user_id = $2 OR ear_id = $2)',
      [conversationId, userId]
    );

    if (conversation.rows.length === 0) {
      return { error: 'Сессия не найдена или доступ запрещен' };
    }

    const messages = await pool.query(
      `SELECT cm.*, u.username 
       FROM conversation_messages cm 
       JOIN users u ON cm.sender_id = u.id 
       WHERE conversation_id = $1 
       ORDER BY sent_at ASC`,
      [conversationId]
    );

    return { messages: messages.rows };
  } catch (error) {
    console.error('Ошибка получения сообщений:', error);
    return { error: 'Внутренняя ошибка сервера' };
  }
}

// Закрыть сессию
async function closeConversation(conversationId, userId) {
  try {
    const conversation = await pool.query(
      'SELECT * FROM conversations WHERE id = $1 AND (user_id = $2 OR ear_id = $2) AND status = $3',
      [conversationId, userId, 'active']
    );

    if (conversation.rows.length === 0) {
      return { error: 'Активная сессия не найдена' };
    }

    // Закрываем сессию
    await pool.query(
      'UPDATE conversations SET status = $1, ended_at = NOW() WHERE id = $2',
      ['closed', conversationId]
    );

    // Освобождаем слушателя
    await pool.query(
      'UPDATE ears SET is_available = true, sessions_completed = sessions_completed + 1 WHERE id = $1',
      [conversation.rows[0].ear_id]
    );

    return { message: 'Сессия закрыта' };
  } catch (error) {
    console.error('Ошибка закрытия сессии:', error);
    return { error: 'Внутренняя ошибка сервера' };
  }
}

// Получить активные сессии пользователя
async function getUserActiveConversations(userId) {
  try {
    const result = await pool.query(
      `SELECT c.*, 
              u1.username as user_username,
              u2.username as ear_username
       FROM conversations c
       JOIN users u1 ON c.user_id = u1.id
       JOIN users u2 ON c.ear_id = u2.id
       WHERE (c.user_id = $1 OR c.ear_id = $1) AND c.status = 'active'
       ORDER BY c.created_at DESC`,
      [userId]
    );

    return result.rows;
  } catch (error) {
    console.error('Ошибка получения активных сессий:', error);
    return [];
  }
}

// Получить сессию по ID
async function getConversationById(conversationId) {
  try {
    const result = await pool.query(
      'SELECT * FROM conversations WHERE id = $1',
      [conversationId]
    );
    return result.rows[0];
  } catch (error) {
    console.error('Ошибка получения сессии:', error);
    return null;
  }
}

module.exports = {
  registerAsEar,
  unregisterAsEar,
  getAvailableEarsCount,
  findAvailableEar,
  createConversation,
  addMessage,
  getConversationMessages,
  closeConversation,
  getUserActiveConversations,
  getConversationById
};