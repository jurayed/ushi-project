// services/ai-chat-service.js
const { pool } = require('../models/database');
const { AI_PROVIDERS } = require('./ai-providers');
const { PSYCHOTYPES } = require('../config/constants');
const { generateSpeech } = require('./tts-service');

// === НАСТРОЙКИ ПАМЯТИ ===
const MAX_HISTORY_MESSAGES = 60; 
const MAX_HISTORY_CHARS = 30000; // ~10k токенов

// Получаем имя пользователя для контекста
async function getUserName(userId) {
    try {
        const res = await pool.query('SELECT username FROM users WHERE id = $1', [userId]);
        return res.rows[0]?.username || 'User';
    } catch (e) { return 'User'; }
}

async function fetchSmartHistory(userId) {
  try {
    const result = await pool.query(
      `SELECT message_text, is_ai_response, sent_at FROM messages WHERE user_id = $1 ORDER BY sent_at DESC LIMIT $2`,
      [userId, MAX_HISTORY_MESSAGES]
    );

    let messages = result.rows.reverse().map(msg => ({
      role: msg.is_ai_response ? 'assistant' : 'user',
      content: msg.message_text
    }));

    // Умная обрезка по символам
    let currentChars = 0;
    const smartMessages = [];
    for (let i = messages.length - 1; i >= 0; i--) {
      const msgLen = messages[i].content.length;
      if (currentChars + msgLen > MAX_HISTORY_CHARS) break;
      currentChars += msgLen;
      smartMessages.unshift(messages[i]);
    }
    return smartMessages;
  } catch (e) {
    console.error("History Error:", e);
    return [];
  }
}

async function saveMessage(userId, text, isAi, psychotype, mediaUrl = null, mediaType = null) {
  try {
    await pool.query(
        'INSERT INTO messages (user_id, message_text, ai_psychotype, is_ai_response, media_url, media_type) VALUES ($1, $2, $3, $4, $5, $6)',
        [userId, text, psychotype, isAi, mediaUrl || null, mediaType || null]
      );
  } catch (e) { console.error("Save MSG Error", e); }
}

// === ОБЫЧНЫЙ ЧАТ ===
async function handleAIChat(req, res) {
  const timings = { start: Date.now(), stt: 0, llm: 0, tts: 0 };
  
  try {
    const { message, psychotype = 'empath', provider = 'deepseek', model, voice_mode = false, stt_time = 0, systemPrompt: customPrompt } = req.body;
    
    timings.stt = stt_time;
    if (!message) return res.status(400).json({ error: 'Пустое сообщение' });

    const aiProvider = AI_PROVIDERS[provider];
    const aiModel = model || aiProvider.defaultModel;
    
    // 1. Формируем System Prompt с Именем
    const username = await getUserName(req.user.id);
    const basePrompt = customPrompt || PSYCHOTYPES[psychotype]?.system_prompt || PSYCHOTYPES.empath.system_prompt;
    
    // 🔥 ВНЕДРЕНИЕ КОНТЕКСТА (Имя)
    const enhancedSystemPrompt = `${basePrompt}\n\n[CONTEXT]\nUser Name: ${username}\nCurrent Date: ${new Date().toLocaleDateString()}`;

    // 2. Сохраняем и грузим историю
    await saveMessage(req.user.id, message, false, psychotype, req.body.media_url, req.body.media_type);
    const history = await fetchSmartHistory(req.user.id);
    
    // 3. LLM Request
    const llmStart = Date.now();
    const messages = [
        { role: 'system', content: enhancedSystemPrompt },
        ...history,
        { role: 'user', content: message }
    ];

    const aiResponse = await aiProvider.chat(enhancedSystemPrompt, messages, aiModel);
    timings.llm = Date.now() - llmStart;

    // 4. TTS
    let audioUrl = null;
    if (voice_mode) {
        const ttsStart = Date.now();
        const ttsResult = await generateSpeech(aiResponse, `${Date.now()}-${req.user.id}`);
        if (ttsResult) {
            audioUrl = ttsResult.url;
            timings.tts = ttsResult.duration_ms; // Берем время из сервиса или вычисляем (Date.now() - ttsStart)
            if(!ttsResult.duration_ms) timings.tts = Date.now() - ttsStart;
        }
    }

    // 5. Сохраняем ответ
    await saveMessage(req.user.id, aiResponse, true, psychotype, audioUrl, 'audio/mp3');

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

// === STREAM CHAT ===
async function handleAIStream(req, res) {
  try {
    const { message, psychotype = 'empath', provider = 'deepseek', model, systemPrompt: customPrompt } = req.body;
    if (!message) return res.status(400).json({ error: 'Empty message' });

    const aiProvider = AI_PROVIDERS[provider];
    const aiModel = model || aiProvider.defaultModel;
    
    const username = await getUserName(req.user.id);
    const basePrompt = customPrompt || PSYCHOTYPES[psychotype]?.system_prompt || PSYCHOTYPES.empath.system_prompt;
    const enhancedSystemPrompt = `${basePrompt}\n\n[CONTEXT]\nUser Name: ${username}`;

    res.writeHead(200, {
      'Content-Type': 'text/plain; charset=utf-8',
      'Transfer-Encoding': 'chunked',
      'Connection': 'keep-alive'
    });

    await saveMessage(req.user.id, message, false, psychotype, req.body.media_url, req.body.media_type);

    const history = await fetchSmartHistory(req.user.id);
    const messages = [
        { role: 'system', content: enhancedSystemPrompt },
        ...history, 
        { role: 'user', content: message }
    ];

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
        try { await saveMessage(req.user.id, fullResponse, true, psychotype); } 
        catch (e) { console.error('Error saving stream response:', e); }
      }
      return originalEnd.call(res, chunk, encoding, callback);
    };

    await aiProvider.stream(enhancedSystemPrompt, messages, aiModel, res);
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
