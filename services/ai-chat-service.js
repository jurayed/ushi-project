// services/ai-chat-service.js
const { pool } = require('../models/database');
const { AI_PROVIDERS } = require('./ai-providers');
const { PSYCHOTYPES } = require('../config/constants');

// Вспомогательная функция: Получить историю
async function fetchHistory(userId) {
  const result = await pool.query(
    `SELECT message_text, is_ai_response FROM messages WHERE user_id = $1 ORDER BY sent_at DESC LIMIT 20`,
    [userId]
  );
  // Превращаем в формат { role: 'user' | 'assistant', content: '...' }
  return result.rows.reverse().map(msg => ({
    role: msg.is_ai_response ? 'assistant' : 'user',
    content: msg.message_text
  }));
}

// Вспомогательная функция: Сохранить сообщение
async function saveMessage(userId, text, isAi, psychotype, mediaUrl = null, mediaType = null) {
  await pool.query(
    'INSERT INTO messages (user_id, message_text, ai_psychotype, is_ai_response, media_url, media_type) VALUES ($1, $2, $3, $4, $5, $6)',
    [userId, text, psychotype, isAi, mediaUrl, mediaType]
  );
}

// === ОБЫЧНЫЙ ЧАТ ===
async function handleAIChat(req, res) {
  try {
    const { message, psychotype = 'empath', provider = 'deepseek', model } = req.body;
    if (!message) return res.status(400).json({ error: 'Пустое сообщение' });

    const aiProvider = AI_PROVIDERS[provider];
    const aiModel = model || aiProvider.defaultModel;
    const systemPrompt = PSYCHOTYPES[psychotype]?.system_prompt || PSYCHOTYPES.empath.system_prompt;

    // 1. История
    const history = await fetchHistory(req.user.id);
    
    // 2. Запрос к AI
    const aiResponse = await aiProvider.chat(systemPrompt, [...history, { role: 'user', content: message }], aiModel);

    // 3. Сохранение в БД
    await saveMessage(req.user.id, message, false, psychotype, req.body.media_url, req.body.media_type);
    await saveMessage(req.user.id, aiResponse, true, psychotype);

    res.json({ success: true, response: aiResponse, provider: aiProvider.name });

  } catch (error) {
    console.error('Chat Error:', error);
    res.status(500).json({ error: error.message });
  }
}

// === ПОТОКОВЫЙ ЧАТ (STREAM) ===
async function handleAIStream(req, res) {
  try {
    const { message, psychotype = 'empath', provider = 'deepseek', model } = req.body;
    if (!message) return res.status(400).json({ error: 'Empty message' });

    const aiProvider = AI_PROVIDERS[provider];
    const aiModel = model || aiProvider.defaultModel;
    const systemPrompt = PSYCHOTYPES[psychotype]?.system_prompt || PSYCHOTYPES.empath.system_prompt;

    // Подготовка заголовков
    res.writeHead(200, {
      'Content-Type': 'text/plain; charset=utf-8',
      'Transfer-Encoding': 'chunked',
      'Connection': 'keep-alive'
    });

    // 1. Сохраняем вопрос пользователя СРАЗУ
    await saveMessage(req.user.id, message, false, psychotype, req.body.media_url, req.body.media_type);

    // 2. История
    const history = await fetchHistory(req.user.id);
    const messages = [...history, { role: 'user', content: message }];

    // 3. Перехват ответа для сохранения
    let fullResponse = '';
    const originalWrite = res.write;
    res.write = function (chunk, encoding, callback) {
      if (chunk) fullResponse += chunk.toString();
      return originalWrite.call(res, chunk, encoding, callback);
    };

    const originalEnd = res.end;
    res.end = async function (chunk, encoding, callback) {
      if (chunk) fullResponse += chunk.toString();
      
      // Когда стрим закончился - сохраняем полный ответ ИИ в базу
      if (fullResponse.trim()) {
        try {
          await saveMessage(req.user.id, fullResponse, true, psychotype);
        } catch (e) { console.error('Error saving stream response:', e); }
      }
      return originalEnd.call(res, chunk, encoding, callback);
    };

    // 4. Запуск стрима провайдера
    await aiProvider.stream(systemPrompt, messages, aiModel, res);
    res.end();

  } catch (error) {
    console.error('Stream Error:', error);
    res.write(`Error: ${error.message}`);
    res.end();
  }
}

async function getChatHistory(req, res) {
  try {
    const result = await pool.query(
      `SELECT * FROM messages WHERE user_id = $1 ORDER BY sent_at ASC`,
      [req.user.id]
    );
    res.json(result.rows);
  } catch (error) {
    res.status(500).json({ error: 'Db Error' });
  }
}

module.exports = { handleAIChat, handleAIStream, getChatHistory };
