const { pool } = require('../models/database');
const { AI_PROVIDERS } = require('./ai-providers');
const { PSYCHOTYPES } = require('../config/constants');

// Чат с ИИ с поддержкой выбора модели
async function handleAIChat(req, res) {
  const startTime = Date.now();

  try {
    const { message, psychotype = 'empath', provider = 'deepseek', model } = req.body;

    if (!message) {
      return res.status(400).json({ error: 'Сообщение обязательно' });
    }

    const selectedPsychotype = PSYCHOTYPES[psychotype] || PSYCHOTYPES.empath;
    const selectedProvider = AI_PROVIDERS[provider];

    // Проверяем доступен ли провайдер
    if (!selectedProvider || !selectedProvider.enabled) {
      return res.status(400).json({
        error: 'Провайдер не доступен',
        available_providers: Object.keys(AI_PROVIDERS).filter(key => AI_PROVIDERS[key].enabled)
      });
    }

    // Определяем модель (используем переданную или дефолтную)
    const selectedModel = model || selectedProvider.defaultModel;

    // Проверяем доступна ли модель у провайдера
    if (!selectedProvider.models[selectedModel]) {
      return res.status(400).json({
        error: 'Модель не доступна для этого провайдера',
        available_models: Object.keys(selectedProvider.models)
      });
    }

    console.log(`🔧 Используем провайдер: ${selectedProvider.name}, модель: ${selectedModel}, психотип: ${selectedPsychotype.name}`);

    // Получаем историю сообщений (без лимита, но с разумным ограничением для контекста, например 100)
    // Для контекста ИИ мы все же должны ограничить количество, иначе упремся в лимит токенов.
    // Но пользователь просил "всю переписку". Попробуем взять 50 последних для контекста.
    let history = [];
    try {
      const historyResult = await pool.query(
        `SELECT message_text, is_ai_response 
         FROM messages 
         WHERE user_id = $1 
         ORDER BY sent_at DESC 
         LIMIT 50`,
        [req.user.id]
      );
      // Разворачиваем историю, чтобы она была в хронологическом порядке
      history = historyResult.rows.reverse().map(msg => ({
        role: msg.is_ai_response ? 'assistant' : 'user',
        content: msg.message_text
      }));
    } catch (histError) {
      console.error('Ошибка получения истории:', histError);
    }

    // Формируем полный промпт с историей
    let contextMessage = message;
    if (history.length > 0) {
      const historyText = history.map(h => `${h.role === 'user' ? 'User' : 'AI'}: ${h.content}`).join('\n');
      contextMessage = `History of conversation:\n${historyText}\n\nCurrent User Message: ${message}`;
    }

    // Замеряем время API запроса
    const apiStartTime = Date.now();
    const aiResponse = await selectedProvider.call(selectedPsychotype.system_prompt, contextMessage, selectedModel);
    const apiResponseTime = Date.now() - apiStartTime;

    const totalTime = Date.now() - startTime;

    // Сохраняем сообщение пользователя в базу данных
    try {
      await pool.query(
        'INSERT INTO messages (user_id, message_text, ai_psychotype, is_ai_response, media_url, media_type) VALUES ($1, $2, $3, $4, $5, $6)',
        [req.user.id, message, psychotype, false, req.body.media_url || null, req.body.media_type || null]
      );
    } catch (dbError) {
      console.error('Ошибка сохранения сообщения пользователя в БД:', dbError);
    }

    // Сохраняем ответ ИИ в базу данных
    try {
      await pool.query(
        'INSERT INTO messages (user_id, message_text, ai_psychotype, is_ai_response) VALUES ($1, $2, $3, $4)',
        [req.user.id, aiResponse, psychotype, true]
      );
    } catch (dbError) {
      console.error('Ошибка сохранения ответа ИИ в БД:', dbError);
    }

    res.json({
      success: true,
      response: aiResponse,
      psychotype: selectedPsychotype.name,
      provider: selectedProvider.name,
      model: selectedModel,
      timing: {
        api_response_time: apiResponseTime,
        total_time: totalTime
      }
    });

  } catch (error) {
    const totalTime = Date.now() - startTime;

    console.error('Chat error:', error);
    res.status(500).json({
      error: 'Ошибка при общении с ИИ',
      details: error.message,
      timing: {
        total_time: totalTime
      }
    });
  }
}

// Получить историю чата для отображения пользователю
async function getChatHistory(req, res) {
  try {
    const result = await pool.query(
      `SELECT id, message_text, is_ai_response, ai_psychotype, sent_at, media_url, media_type 
       FROM messages 
       WHERE user_id = $1 
       ORDER BY sent_at ASC`,
      [req.user.id]
    );

    res.json(result.rows);
  } catch (error) {
    console.error('Ошибка получения истории чата:', error);
    res.status(500).json({ error: 'Внутренняя ошибка сервера' });
  }
}

// Потоковый чат с ИИ
async function handleAIStream(req, res) {
  try {
    const { message, psychotype = 'empath', provider = 'deepseek', model } = req.body;

    if (!message) {
      return res.status(400).json({ error: 'Сообщение обязательно' });
    }

    const selectedPsychotype = PSYCHOTYPES[psychotype] || PSYCHOTYPES.empath;
    const selectedProvider = AI_PROVIDERS[provider];

    // Проверяем доступен ли провайдер
    if (!selectedProvider || !selectedProvider.enabled) {
      return res.status(400).json({ error: 'Провайдер не доступен' });
    }

    // Определяем модель
    const selectedModel = model || selectedProvider.defaultModel;

    console.log(`🔧 Streaming: ${selectedProvider.name}, модель: ${selectedModel}, психотип: ${selectedPsychotype.name}`);

    // Получаем историю для контекста (также 50 последних)
    let history = [];
    try {
      const historyResult = await pool.query(
        `SELECT message_text, is_ai_response 
         FROM messages 
         WHERE user_id = $1 
         ORDER BY sent_at DESC 
         LIMIT 50`,
        [req.user.id]
      );
      history = historyResult.rows.reverse().map(msg => ({
        role: msg.is_ai_response ? 'assistant' : 'user',
        content: msg.message_text
      }));
    } catch (histError) {
      console.error('Ошибка получения истории:', histError);
    }

    // Формируем полный промпт с историей
    let contextMessage = message;
    if (history.length > 0) {
      const historyText = history.map(h => `${h.role === 'user' ? 'User' : 'AI'}: ${h.content}`).join('\n');
      contextMessage = `History of conversation:\n${historyText}\n\nCurrent User Message: ${message}`;
    }

    // Сохраняем сообщение пользователя
    try {
      await pool.query(
        'INSERT INTO messages (user_id, message_text, ai_psychotype, is_ai_response, media_url, media_type) VALUES ($1, $2, $3, $4, $5, $6)',
        [req.user.id, message, psychotype, false, req.body.media_url || null, req.body.media_type || null]
      );
    } catch (dbError) {
      console.error('Ошибка сохранения сообщения пользователя в БД:', dbError);
    }

    // Настраиваем headers для streaming
    res.writeHead(200, {
      'Content-Type': 'text/plain; charset=utf-8',
      'Transfer-Encoding': 'chunked',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
      'Access-Control-Allow-Origin': '*'
    });

    // В зависимости от провайдера вызываем streaming функцию
    // ВАЖНО: Нам нужно перехватить полный ответ для сохранения в БД после стриминга
    // Для этого мы можем обернуть res.write или использовать промежуточный буфер

    // Простая реализация: мы не сохраняем ответ ИИ при стриминге в этой версии (так как это сложно сделать без дублирования логики стриминга)
    // ИЛИ мы можем попросить провайдера вернуть полный текст, но стриминг подразумевает чанки.
    // Пока оставим без сохранения ответа ИИ при стриминге (или добавим TODO), так как это требует переписывания стриминг-функций.
    // User request: "общение с ИИ отображалось и была история видна". 
    // Если мы не сохраним ответ стриминга, он пропадет из истории. Это плохо.
    // Давайте пока отключим стриминг для сохранения истории или реализуем накопление.

    // Решение: Передадим callback в стриминг функции для накопления ответа
    let accumulatedResponse = '';
    const originalWrite = res.write;
    res.write = function (chunk, encoding, callback) {
      if (typeof chunk === 'string') {
        accumulatedResponse += chunk;
      } else if (Buffer.isBuffer(chunk)) {
        accumulatedResponse += chunk.toString();
      }
      return originalWrite.call(res, chunk, encoding, callback);
    };

    const originalEnd = res.end;
    res.end = async function (chunk, encoding, callback) {
      if (chunk) {
        if (typeof chunk === 'string') accumulatedResponse += chunk;
        else if (Buffer.isBuffer(chunk)) accumulatedResponse += chunk.toString();
      }

      // Сохраняем накопленный ответ в БД
      if (accumulatedResponse && !accumulatedResponse.includes('data: {"error":')) {
        try {
          // Очищаем от SSE формата если нужно (но у нас raw text стриминг для некоторых, и SSE для других)
          // В текущей реализации callOpenAIStream пишет чистый контент (res.write(content)).
          // callDeepSeekStream тоже.
          // callGeminiStream тоже.
          // Значит accumulatedResponse содержит чистый текст ответа.

          await pool.query(
            'INSERT INTO messages (user_id, message_text, ai_psychotype, is_ai_response) VALUES ($1, $2, $3, $4)',
            [req.user.id, accumulatedResponse, psychotype, true]
          );
        } catch (dbError) {
          console.error('Ошибка сохранения стриминг-ответа ИИ в БД:', dbError);
        }
      }

      return originalEnd.call(res, chunk, encoding, callback);
    };

    if (provider === 'openai') {
      await callOpenAIStream(selectedPsychotype.system_prompt, contextMessage, selectedModel, res);
    } else if (provider === 'deepseek') {
      await callDeepSeekStream(selectedPsychotype.system_prompt, contextMessage, selectedModel, res);
    } else {
      await callGeminiStream(selectedPsychotype.system_prompt, contextMessage, selectedModel, res);
    }

  } catch (error) {
    console.error('Stream chat error:', error);
    res.write(`data: ${JSON.stringify({ error: error.message })}\n\n`);
    res.end();
  }
}

// Streaming функции для каждого провайдера
async function callOpenAIStream(systemPrompt, userMessage, model, res) {
  try {
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`
      },
      body: JSON.stringify({
        model: model,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userMessage }
        ],
        max_tokens: 500,
        temperature: 0.7,
        stream: true
      })
    });

    if (!response.ok) {
      throw new Error(`OpenAI API error: ${response.status}`);
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let fullResponse = '';

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const chunk = decoder.decode(value);
        const lines = chunk.split('\n');

        for (const line of lines) {
          if (line.startsWith('data: ') && !line.includes('[DONE]')) {
            try {
              const data = JSON.parse(line.slice(6));
              const content = data.choices[0]?.delta?.content;
              if (content) {
                fullResponse += content;
                res.write(content);
              }
            } catch (e) {
              // Игнорируем ошибки парсинга
            }
          }
        }
      }
    } finally {
      reader.releaseLock();
      res.end();
    }
  } catch (error) {
    console.error('OpenAI streaming error:', error);
    res.write(`Ошибка: ${error.message}`);
    res.end();
  }
}

async function callDeepSeekStream(systemPrompt, userMessage, model, res) {
  try {
    const response = await fetch('https://api.deepseek.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${process.env.DEEPSEEK_API_KEY}`
      },
      body: JSON.stringify({
        model: model,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userMessage }
        ],
        max_tokens: 500,
        temperature: 0.7,
        stream: true
      })
    });

    if (!response.ok) {
      throw new Error(`DeepSeek API error: ${response.status}`);
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let fullResponse = '';

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const chunk = decoder.decode(value);
        const lines = chunk.split('\n');

        for (const line of lines) {
          if (line.startsWith('data: ') && !line.includes('[DONE]')) {
            try {
              const data = JSON.parse(line.slice(6));
              const content = data.choices[0]?.delta?.content;
              if (content) {
                fullResponse += content;
                res.write(content);
              }
            } catch (e) {
              // Игнорируем ошибки парсинга
            }
          }
        }
      }
    } finally {
      reader.releaseLock();
      res.end();
    }
  } catch (error) {
    console.error('DeepSeek streaming error:', error);
    res.write(`Ошибка: ${error.message}`);
    res.end();
  }
}

// Эмуляция streaming для Gemini
async function callGeminiStream(systemPrompt, userMessage, model, res) {
  try {
    const fullResponse = await AI_PROVIDERS.gemini.call(systemPrompt, userMessage, model);

    // Эмулируем streaming - разбиваем ответ на части
    const words = fullResponse.split(' ');
    for (let i = 0; i < words.length; i++) {
      await new Promise(resolve => setTimeout(resolve, 50));
      res.write(words[i] + ' ');
    }
  } catch (error) {
    console.error('Gemini streaming error:', error);
    res.write(`Ошибка: ${error.message}`);
  } finally {
    res.end();
  }
}

module.exports = {
  handleAIChat,
  handleAIStream,
  getChatHistory
};