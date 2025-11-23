require('dotenv').config();
const express = require('express');
const { Pool } = require('pg');
const bcrypt = require('bcrypt');
const cors = require('cors');
const path = require('path');
const jwt = require('jsonwebtoken');

const app = express();
const port = process.env.PORT || 3000;

// ==================== ENVIRONMENT VARIABLES CHECK ====================
console.log('🔧 Проверка переменных окружения:');
console.log('   PORT:', process.env.PORT);
console.log('   DB_HOST:', process.env.DB_HOST);
console.log('   DB_PORT:', process.env.DB_PORT);
console.log('   DB_NAME:', process.env.DB_NAME);
console.log('   DB_USER:', process.env.DB_USER);
console.log('   JWT_SECRET:', process.env.JWT_SECRET ? '***установлен***' : '❌ отсутствует');
console.log('   DEEPSEEK_API_KEY:', process.env.DEEPSEEK_API_KEY ? '***установлен***' : '❌ отсутствует');
console.log('   OPENAI_API_KEY:', process.env.OPENAI_API_KEY ? '***установлен***' : '❌ отсутствует');
console.log('   GOOGLE_API_KEY:', process.env.GOOGLE_API_KEY ? '***установлен***' : '❌ отсутствует');

// Проверяем обязательные переменные
if (!process.env.JWT_SECRET) {
  console.error('❌ КРИТИЧЕСКАЯ ОШИБКА: JWT_SECRET не установлен в .env файле');
  process.exit(1);
}

// ==================== MIDDLEWARE ====================
app.use(cors({
  origin: '*',
  methods: ['GET', 'POST', 'PUT', 'DELETE'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));

app.use(express.json());
app.use(express.static(path.join(__dirname)));

// ==================== DATABASE CONNECTION ====================
const pool = new Pool({
  host: process.env.DB_HOST,
  port: process.env.DB_PORT,
  database: process.env.DB_NAME,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
});

// ==================== JWT AUTHENTICATION ====================
function authenticateToken(req, res, next) {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (token == null) return res.sendStatus(401);

  jwt.verify(token, process.env.JWT_SECRET, (err, user) => {
    if (err) {
      console.error('JWT verification error:', err);
      return res.sendStatus(403);
    }
    req.user = user;
    next();
  });
}

// ==================== AI PROVIDERS CONFIGURATION ====================
const AI_PROVIDERS = {
  deepseek: {
    name: 'DeepSeek',
    enabled: !!process.env.DEEPSEEK_API_KEY,
    models: {
      'deepseek-chat': { name: 'DeepSeek Chat', context: 32_768, price: '$0.14/1M input' },
      'deepseek-coder': { name: 'DeepSeek Coder', context: 16_384, price: '$0.14/1M input' }
    },
    defaultModel: 'deepseek-chat',
    call: callDeepSeek
  },
  openai: {
    name: 'OpenAI',
    enabled: !!process.env.OPENAI_API_KEY,
    models: {
      'gpt-4-turbo-preview': { name: 'GPT-4 Turbo', context: 128_000, price: '$10/1M input' },
      'gpt-4': { name: 'GPT-4', context: 8_192, price: '$30/1M input' },
      'gpt-3.5-turbo': { name: 'GPT-3.5 Turbo', context: 16_385, price: '$1.5/1M input' }
    },
    defaultModel: 'gpt-4-turbo-preview',
    call: callOpenAI
  },
  gemini: {
    name: 'Google Gemini',
    enabled: !!process.env.GOOGLE_API_KEY,
    models: {
      'gemini-2.0-flash': { 
        name: 'Gemini 2.0 Flash (рекомендуется)', 
        context: 1_000_000, 
        price: 'Бесплатно (быстрая)' 
      },
      'gemini-2.0-flash-001': { 
        name: 'Gemini 2.0 Flash 001', 
        context: 1_000_000, 
        price: 'Бесплатно' 
      },
      'gemini-2.5-flash': { 
        name: 'Gemini 2.5 Flash (новая)', 
        context: 1_000_000, 
        price: 'Бесплатно' 
      },
      'gemini-2.0-flash-lite': { 
        name: 'Gemini 2.0 Flash Lite', 
        context: 1_000_000, 
        price: 'Бесплатно (облегченная)' 
      }
    },
    defaultModel: 'gemini-2.0-flash',
    call: callGemini
  }
};

// Психотипы ИИ
const PSYCHOTYPES = {
  empath: {
    name: 'Эмпат',
    description: 'Сочувствующий и понимающий слушатель',
    system_prompt: 'Ты - эмпатичный слушатель. Ты внимательно слушаешь, проявляешь сочувствие и понимание. Ты помогаешь пользователю выговориться и почувствовать себя услышанным. Отвечай тепло и поддерживающе.'
  },
  optimist: {
    name: 'Оптимист', 
    description: 'Позитивный и воодушевляющий',
    system_prompt: 'Ты - позитивный оптимист. Ты видишь хорошее в любой ситуации и помогаешь пользователю найти позитивные стороны. Ты воодушевляешь и мотивируешь. Отвечай энергично и позитивно.'
  },
  rational: {
    name: 'Рационалист',
    description: 'Логичный и аналитический',
    system_prompt: 'Ты - рациональный аналитик. Ты помогаешь пользователю разобраться в ситуации логически, анализируешь факты и ищешь практические решения. Отвечай спокойте и разумно.'
  }
};

// ==================== AI PROVIDER FUNCTIONS ====================

// DeepSeek API с поддержкой модели
async function callDeepSeek(systemPrompt, userMessage, model = 'deepseek-chat') {
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
        temperature: 0.7
      })
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`❌ DeepSeek API error ${response.status}:`, errorText);
      throw new Error(`DeepSeek API error: ${response.status}`);
    }

    const data = await response.json();
    return data.choices[0].message.content;
  } catch (error) {
    console.error('❌ DeepSeek API call failed:', error);
    throw error;
  }
}

// OpenAI API с поддержкой модели
async function callOpenAI(systemPrompt, userMessage, model = 'gpt-4-turbo-preview') {
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
        temperature: 0.7
      })
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`❌ OpenAI API error ${response.status}:`, errorText);
      throw new Error(`OpenAI API error: ${response.status}`);
    }

    const data = await response.json();
    return data.choices[0].message.content;
  } catch (error) {
    console.error('❌ OpenAI API call failed:', error);
    throw error;
  }
}

// Google Gemini API с поддержкой модели
async function callGemini(systemPrompt, userMessage, model = 'gemini-2.0-flash') {
  try {
    const url = `https://generativelanguage.googleapis.com/v1/models/${model}:generateContent?key=${process.env.GOOGLE_API_KEY}`;
    
    console.log(`🔍 Gemini API Call: ${model}`);
    
    const requestBody = {
      contents: [
        {
          parts: [
            {
              text: `${systemPrompt}\n\nUser: ${userMessage}\n\nAssistant:`
            }
          ]
        }
      ],
      generationConfig: {
        maxOutputTokens: 500,
        temperature: 0.7
      }
    };

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(requestBody)
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`❌ Gemini API error ${response.status}:`, errorText);
      throw new Error(`Gemini API error: ${response.status}`);
    }

    const data = await response.json();
    
    if (data.candidates && data.candidates[0] && data.candidates[0].content && data.candidates[0].content.parts[0]) {
      return data.candidates[0].content.parts[0].text;
    } else {
      throw new Error('Invalid response format from Gemini API');
    }

  } catch (error) {
    console.error('❌ Gemini API call failed:', error);
    throw error;
  }
}

// ==================== DATABASE INITIALIZATION ====================
async function initializeDatabase() {
  try {
    console.log('🔌 Проверяем подключение к базе данных...');
    
    // Простая проверка подключения
    const client = await pool.connect();
    console.log('✅ Подключение к базе данных успешно');
    client.release();

    console.log('🔄 Создаем таблицы...');
    await pool.query(`
      CREATE TABLE IF NOT EXISTS users (
        id SERIAL PRIMARY KEY,
        username VARCHAR(50) UNIQUE NOT NULL,
        email VARCHAR(100) UNIQUE NOT NULL,
        password_hash VARCHAR(255) NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
    console.log('✅ Таблица users создана/проверена');

    await pool.query(`
      CREATE TABLE IF NOT EXISTS messages (
        id SERIAL PRIMARY KEY,
        user_id INTEGER REFERENCES users(id),
        message_text TEXT NOT NULL,
        ai_psychotype VARCHAR(50),
        is_ai_response BOOLEAN DEFAULT FALSE,
        sent_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
    console.log('✅ Таблица messages создана/проверена');

    console.log('✅ Все таблицы базы данных созданы/проверены');
    return true;
  } catch (error) {
    console.error('❌ Критическая ошибка базы данных:', error);
    console.error('🔧 Детали ошибки:', error.message);
    return false;
  }
}

// ==================== API ROUTES ====================

// Health check endpoint
app.get('/api/health', (req, res) => {
  res.json({ 
    status: 'OK', 
    timestamp: new Date().toISOString(),
    uptime: process.uptime()
  });
});

// Получить список психотипов
app.get('/api/psychotypes', (req, res) => {
  res.json(PSYCHOTYPES);
});

// Получить список доступных провайдеров и их моделей
app.get('/api/providers', (req, res) => {
  const availableProviders = Object.entries(AI_PROVIDERS)
    .filter(([key, provider]) => provider.enabled)
    .map(([key, provider]) => ({
      id: key,
      name: provider.name,
      enabled: provider.enabled,
      models: provider.models,
      defaultModel: provider.defaultModel
    }));
  
  res.json(availableProviders);
});

// Регистрация пользователя
app.post('/api/register', async (req, res) => {
  try {
    console.log('🔑 Попытка регистрации:', req.body);
    
    const { username, email, password } = req.body;
    
    if (!username || !email || !password) {
      return res.status(400).json({ error: 'Все поля обязательны' });
    }

    const saltRounds = 10;
    const passwordHash = await bcrypt.hash(password, saltRounds);

    const result = await pool.query(
      'INSERT INTO users (username, email, password_hash) VALUES ($1, $2, $3) RETURNING id, username, email, created_at',
      [username, email, passwordHash]
    );

    console.log('✅ Пользователь зарегистрирован:', username);

    res.status(201).json({
      message: 'Пользователь успешно зарегистрирован',
      user: result.rows[0]
    });
  } catch (error) {
    console.error('❌ Ошибка регистрации:', error);
    if (error.code === '23505') {
      res.status(400).json({ error: 'Пользователь с таким именем или email уже существует' });
    } else {
      res.status(500).json({ error: 'Внутренняя ошибка сервера' });
    }
  }
});

// Вход пользователя
app.post('/api/login', async (req, res) => {
  try {
    console.log('🔑 Попытка входа:', req.body);
    
    const { username, password } = req.body;

    if (!username || !password) {
      console.log('❌ Не все поля заполнены');
      return res.status(400).json({ error: 'Все поля обязательны' });
    }

    console.log('🔍 Ищем пользователя:', username);
    const result = await pool.query(
      'SELECT * FROM users WHERE username = $1',
      [username]
    );

    if (result.rows.length === 0) {
      console.log('❌ Пользователь не найден:', username);
      return res.status(401).json({ error: 'Неверное имя пользователя или пароль' });
    }

    const user = result.rows[0];
    console.log('✅ Пользователь найден:', user.username);

    const passwordMatch = await bcrypt.compare(password, user.password_hash);
    
    if (!passwordMatch) {
      console.log('❌ Неверный пароль для пользователя:', username);
      return res.status(401).json({ error: 'Неверное имя пользователя или пароль' });
    }

    // Создаем JWT токен
    const token = jwt.sign(
      { 
        id: user.id, 
        username: user.username 
      }, 
      process.env.JWT_SECRET,
      { expiresIn: '24h' }
    );

    console.log('✅ Вход выполнен успешно, токен выдан для:', username);

    res.json({
      message: 'Вход выполнен успешно',
      token: token,
      user: {
        id: user.id,
        username: user.username,
        email: user.email,
        created_at: user.created_at
      }
    });
  } catch (error) {
    console.error('❌ Ошибка входа:', error);
    console.error('🔧 Детали ошибки:', error.message);
    res.status(500).json({ 
      error: 'Внутренняя ошибка сервера',
      details: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

// Получить профиль пользователя
app.get('/api/profile', authenticateToken, async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT id, username, email, created_at FROM users WHERE id = $1',
      [req.user.id]
    );
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Пользователь не найден' });
    }
    
    res.json(result.rows[0]);
  } catch (error) {
    console.error('Ошибка получения профиля:', error);
    res.status(500).json({ error: 'Внутренняя ошибка сервера' });
  }
});

// Получить список пользователей (для админов)
app.get('/api/users', authenticateToken, async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT id, username, email, created_at FROM users ORDER BY created_at DESC'
    );
    res.json(result.rows);
  } catch (error) {
    console.error('Ошибка получения пользователей:', error);
    res.status(500).json({ error: 'Внутренняя ошибка сервера' });
  }
});

// Чат с ИИ с поддержкой выбора модели
app.post('/api/chat/ai', authenticateToken, async (req, res) => {
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

    // Замеряем время API запроса
    const apiStartTime = Date.now();
    const aiResponse = await selectedProvider.call(selectedPsychotype.system_prompt, message, selectedModel);
    const apiResponseTime = Date.now() - apiStartTime;

    const totalTime = Date.now() - startTime;

    // Сохраняем сообщение в базу данных
    try {
      await pool.query(
        'INSERT INTO messages (user_id, message_text, ai_psychotype, is_ai_response) VALUES ($1, $2, $3, $4)',
        [req.user.id, aiResponse, psychotype, true]
      );
    } catch (dbError) {
      console.error('Ошибка сохранения сообщения в БД:', dbError);
      // Не прерываем выполнение, если не удалось сохранить в БД
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
});

// ==================== STREAMING ENDPOINT ====================

// Потоковый чат с ИИ
app.post('/api/chat/ai/stream', authenticateToken, async (req, res) => {
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

    // Настраиваем headers для streaming
    res.writeHead(200, {
      'Content-Type': 'text/plain; charset=utf-8',
      'Transfer-Encoding': 'chunked',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
      'Access-Control-Allow-Origin': '*'
    });

    // В зависимости от провайдера вызываем streaming функцию
    if (provider === 'openai') {
      await callOpenAIStream(selectedPsychotype.system_prompt, message, selectedModel, res);
    } else if (provider === 'deepseek') {
      await callDeepSeekStream(selectedPsychotype.system_prompt, message, selectedModel, res);
    } else {
      // Для Gemini и других, которые не поддерживают streaming, эмулируем
      await callGeminiStream(selectedPsychotype.system_prompt, message, selectedModel, res);
    }

  } catch (error) {
    console.error('Stream chat error:', error);
    res.write(`data: ${JSON.stringify({ error: error.message })}\n\n`);
    res.end();
  }
});

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
    const fullResponse = await callGemini(systemPrompt, userMessage, model);
    
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

// Serve the main HTML file
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'test1.html'));
});

// ==================== SERVER START ====================
async function startServer() {
  try {
    console.log('🔄 Инициализация базы данных...');
    const dbInitialized = await initializeDatabase();
    
    if (dbInitialized) {
      app.listen(port, () => {
        console.log(`🚀 Сервер запущен на http://localhost:${port}`);
        console.log(`📊 Доступные endpoints:`);
        console.log(`   GET  /api/health`);
        console.log(`   GET  /api/providers`);
        console.log(`   GET  /api/psychotypes`);
        console.log(`   GET  /api/users`);
        console.log(`   POST /api/register`);
        console.log(`   POST /api/login`);
        console.log(`   POST /api/chat/ai`);
        console.log(`   POST /api/chat/ai/stream`);
        
        // Показываем доступные провайдеры и модели
        console.log(`🤖 Доступные AI провайдеры и модели:`);
        Object.entries(AI_PROVIDERS).forEach(([key, provider]) => {
          console.log(`   - ${provider.name}: ${provider.enabled ? '✅' : '❌'}`);
          if (provider.enabled) {
            Object.entries(provider.models).forEach(([modelKey, modelInfo]) => {
              console.log(`     * ${modelKey}: ${modelInfo.name} (${modelInfo.context} tokens)`);
            });
          }
        });
      });
    } else {
      console.log('❌ Не удалось инициализировать базу данных. Сервер не запущен.');
    }
  } catch (error) {
    console.error('❌ Ошибка запуска сервера:', error);
  }
}

// Запускаем сервер
startServer();