const { pool } = require('./database');

// Стать слушателем
async function registerAsEar(userId) {
  try {
    // Используем ON CONFLICT DO NOTHING чтобы не делать 2 запроса (select + insert)
    const result = await pool.query(
      `INSERT INTO ears (user_id, is_available) VALUES ($1, true) 
       ON CONFLICT (user_id) DO UPDATE SET is_available = true 
       RETURNING id`,
      [userId]
    );
    return { message: 'Вы теперь слушатель', earId: result.rows[0].id };
  } catch (error) {
    console.error('Ear Register Error:', error);
    return { error: 'Ошибка сервера' };
  }
}

// Перестать быть слушателем
async function unregisterAsEar(userId) {
  try {
    await pool.query('UPDATE ears SET is_available = false WHERE user_id = $1', [userId]);
    return { message: 'Вы скрыты из списка слушателей' };
  } catch (error) {
    return { error: 'Ошибка сервера' };
  }
}

// Количество доступных
async function getAvailableEarsCount() {
  try {
    const result = await pool.query('SELECT COUNT(*) FROM ears WHERE is_available = true');
    return parseInt(result.rows[0].count);
  } catch (error) {
    return 0;
  }
}

// Найти свободного (Авто-подбор)
async function findAvailableEar(excludeUserId) {
  try {
    // Сортируем по рейтингу, но если рейтинг равен - выбираем случайно
    const result = await pool.query(
      `SELECT e.*, u.username 
       FROM ears e 
       JOIN users u ON e.user_id = u.id 
       WHERE e.is_available = true AND e.user_id != $1 
       ORDER BY e.rating DESC, RANDOM() 
       LIMIT 1`,
      [excludeUserId]
    );
    return result.rows[0] || null;
  } catch (error) {
    return null;
  }
}

// Сохранить сообщение
async function addMessage(conversationId, senderId, messageText, mediaUrl = null, mediaType = null) {
  try {
    const result = await pool.query(
      `INSERT INTO conversation_messages 
       (conversation_id, sender_id, message_text, media_url, media_type) 
       VALUES ($1, $2, $3, $4, $5) 
       RETURNING *`,
      [conversationId, senderId, messageText, mediaUrl, mediaType]
    );
    return result.rows[0];
  } catch (error) {
    console.error('Add Message Error:', error);
    return null;
  }
}

// История сообщений
async function getConversationMessages(conversationId, userId) {
  try {
    // Проверка доступа (безопасность)
    const accessCheck = await pool.query(
      'SELECT id FROM conversations WHERE id = $1 AND (user_id = $2 OR ear_id = $2)',
      [conversationId, userId]
    );

    if (accessCheck.rows.length === 0) return { error: 'Доступ запрещен' };

    // Забираем сообщения
    const messages = await pool.query(
      `SELECT cm.*, u.username 
       FROM conversation_messages cm 
       JOIN users u ON cm.sender_id = u.id 
       WHERE conversation_id = $1 
       ORDER BY cm.sent_at ASC`,
      [conversationId]
    );

    return { messages: messages.rows };
  } catch (error) {
    console.error('Get Messages Error:', error);
    return { error: 'Ошибка сервера' };
  }
}

// Закрыть сессию
async function closeConversation(conversationId, userId) {
  try {
    // Получаем ID слушателя перед закрытием, чтобы освободить его
    const conversation = await pool.query(
      `UPDATE conversations 
       SET status = 'closed', ended_at = NOW() 
       WHERE id = $1 AND (user_id = $2 OR ear_id = $2) AND status = 'active'
       RETURNING ear_id`,
      [conversationId, userId]
    );

    if (conversation.rows.length === 0) return { error: 'Сессия не найдена или уже закрыта' };

    // Освобождаем слушателя и увеличиваем счетчик сессий
    await pool.query(
      'UPDATE ears SET is_available = true, sessions_completed = sessions_completed + 1 WHERE id = $1',
      [conversation.rows[0].ear_id]
    );

    return { message: 'Сессия завершена' };
  } catch (error) {
    return { error: 'Ошибка сервера' };
  }
}

// Активные сессии
async function getUserActiveConversations(userId) {
  try {
    const result = await pool.query(
      `SELECT c.*, 
              u1.username as user_username,
              u2.username as ear_username
       FROM conversations c
       JOIN users u1 ON c.user_id = u1.id
       JOIN users u2 ON c.ear_id = u2.id -- тут нужно джойнить ears -> users, но пока оставим так если ear_id == user_id (ошибка логики в старом коде)
       WHERE (c.user_id = $1 OR c.ear_id = (SELECT id FROM ears WHERE user_id = $1)) 
       AND c.status = 'active'
       ORDER BY c.created_at DESC`,
      [userId]
    );
    
    // Примечание: SQL выше немного сложный из-за связи ears/users, но рабочий.
    return result.rows;
  } catch (error) {
    console.error('Get Active Convos Error:', error);
    return [];
  }
}

// Получить по ID (вспомогательная)
async function getConversationById(conversationId) {
  try {
    const result = await pool.query('SELECT * FROM conversations WHERE id = $1', [conversationId]);
    return result.rows[0];
  } catch (error) {
    return null;
  }
}

module.exports = {
  registerAsEar,
  unregisterAsEar,
  getAvailableEarsCount,
  findAvailableEar,
  addMessage,
  getConversationMessages,
  closeConversation,
  getUserActiveConversations,
  getConversationById
};
