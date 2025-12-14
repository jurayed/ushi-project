// services/ai-chat-service.js
const { pool } = require('../models/database');
const { AI_PROVIDERS } = require('./ai-providers');
const { PSYCHOTYPES } = require('../config/constants');
const { generateSpeech } = require('./tts-service');

// Вспомогательные функции
async function fetchHistory(userId) {
  const result = await pool.query(
    `SELECT message_text, is_ai_response FROM messages WHERE user_id = $1 ORDER BY sent_at DESC LIMIT 10`,
    [userId]
  );
  return result.rows.reverse().map(msg => ({
    role: msg.is_ai_response ? 'assistant' : 'user',
    content: msg.message_text
  }));
}

async function saveMessage(userId, text, isAi, psychotype, mediaUrl = null, mediaType = null) {
  await pool.query(
    'INSERT INTO messages (user_id, message_text, ai_psychotype, is_ai_response, media_url, media_type) VALUES ($1, $2, $3, $4, $5, $6)',
    [userId, text, psychotype, isAi, mediaUrl || null, mediaType || null]
  );
}

// === ОБЫЧНЫЙ ЧАТ (С TTS) ===
async function handleAIChat(req, res) {
  const timings = { start: Date.now(), stt: 0, llm: 0, tts: 0 };
  
  try {
    const { message, psychotype = 'empath', provider = 'deepseek', model, voice_mode = false, stt_time = 0 } = req.body;
    
    timings.stt = stt_time;

    if (!message) return res.status(400).json({ error: 'Пустое сообщение' });

    const aiProvider = AI_PROVIDERS[provider];
    const aiModel = model || aiProvider.defaultModel;
    const systemPrompt = PSYCHOTYPES[psychotype]?.system_prompt || PSYCHOTYPES.empath.system_prompt;

    // 1. Сохраняем вопрос юзера
    await saveMessage(req.user.id, message, false, psychotype, req.body.media_url, req.body.media_type);

    // 2. LLM
    const llmStart = Date.now();
    const history = await fetchHistory(req.user.id);
    const aiResponse = await aiProvider.chat(systemPrompt, [...history, { role: 'user', content: message }], aiModel);
    timings.llm = Date.now() - llmStart;

    let audioUrl = null;
    let audioType = null;

    // 3. TTS (если нужен голос)
    if (voice_mode) {
        const ttsStart = Date.now();
        const ttsResult = await generateSpeech(aiResponse, `${Date.now()}-${req.user.id}`);
        if (ttsResult) {
            audioUrl = ttsResult.url;
            audioType = 'audio/mp3';
            timings.tts = ttsResult.duration_ms;
        }
    }

    // 4. Сохраняем ответ
    await saveMessage(req.user.id, aiResponse, true, psychotype, audioUrl, audioType);

    res.json({
        success: true,
        response: aiResponse,
        psychotype: PSYCHOTYPES[psychotype].name,
        provider: aiProvider.name,
        audio_url: audioUrl,
        timings: {
            ...timings,
            total: Date.now() - timings.start
        }
    });

  } catch (error) {
    console.error('Chat Error:', error);
    res.status(500).json({ error: error.message });
  }
}

// === ПОТОКОВЫЙ ЧАТ (Восстановлен!) ===
async function handleAIStream(req, res) {
  try {
    const { message, psychotype = 'empath', provider = 'deepseek', model } = req.body;
    if (!message) return res.status(400).json({ error: 'Empty message' });

    const aiProvider = AI_PROVIDERS[provider];
    const aiModel = model || aiProvider.defaultModel;
    const systemPrompt = PSYCHOTYPES[psychotype]?.system_prompt || PSYCHOTYPES.empath.system_prompt;

    // Заголовки для стрима
    res.writeHead(200, {
      'Content-Type': 'text/plain; charset=utf-8',
      'Transfer-Encoding': 'chunked',
      'Connection': 'keep-alive'
    });

    // 1. Сохраняем вопрос
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
      
      if (fullResponse.trim()) {
        try {
          await saveMessage(req.user.id, fullResponse, true, psychotype);
        } catch (e) { console.error('Error saving stream response:', e); }
      }
      return originalEnd.call(res, chunk, encoding, callback);
    };

    // 4. Запуск стрима
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
