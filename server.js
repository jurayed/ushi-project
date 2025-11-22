
require('dotenv').config();
const express = require('express');
const { Pool } = require('pg');
const bcrypt = require('bcrypt');
const cors = require('cors');
const path = require('path');

const app = express();
const port = process.env.PORT || 3000;

// ==================== MIDDLEWARE ====================
app.use(cors({
  origin: '*',
  methods: ['GET', 'POST', 'PUT', 'DELETE'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));

app.use(express.json());
app.use(express.static(path.join(__dirname

)));

// ==================== DATABASE CONNECTION ====================
const pool = new Pool({
  host: process.env.DB_HOST,
  port: process.env.DB_PORT,
  database: process.env.DB_NAME,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
});

// ==================== DEEPSEEK API SETUP ====================
const DEEPSEEK_API_URL = 'https://api.deepseek.com/v1/chat/completions';

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
    system_prompt: 'Ты - рациональный аналитик. Ты помогаешь пользователю разобраться в ситуации логически, анализируешь факты и ищешь практические решения. Отвечай спокойно и разумно.'
  }
};

// ==================== DATABASE INITIALIZATION ====================
async function initializeDatabase() {
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS users (
        id SERIAL PRIMARY KEY,
        username VARCHAR(50) UNIQUE NOT 

NULL,
        email VARCHAR(100) UNIQUE NOT NULL,
        password_hash VARCHAR(255) NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    await pool.query(`
      CREATE TABLE IF NOT EXISTS messages (
        id SERIAL PRIMARY KEY,
        user_id INTEGER REFERENCES users(id),
        message_text TEXT NOT NULL,
        ai_psychotype VARCHAR(50),
        is_ai_response BOOLEAN DEFAULT FALSE,
        sent_at TIMESTAMP DEFAULT 

CURRENT_TIMESTAMP
      )
    `);

    console.log('✅ Таблицы базы данных созданы/проверены');
    return true;
  } catch (error) {
    console.error('❌ Ошибка создания таблиц:', error);
    return false;
  }
}

// ==================== API ROUTES ====================

// Регистрация пользователя
app.post('/api/register', async (req, res) => {
  try {

    const { username, email, password } = req.body;
    
    // Проверяем обязательные поля
    if (!username || !email || !password) {
      return res.status(400).json({ error: 'Все поля обязательны' });
    }

    const saltRounds = 10;
    const passwordHash = await bcrypt.hash(password, saltRounds);

    const result = await pool.query(
      'INSERT INTO users (username, email, password_hash) VALUES ($1, $2, $3) RETURNING id, username, email, created_at',
      [username, email, passwordHash]
    );

    res.status(201).json({
      message: 'Пользователь успешно зарегистрирован',
      user: result.rows[0]
    });
  } catch (error) {
    if (error.code === '23505') {
      res.status(400).json({ error: 'Пользователь с таким именем или email уже существует' });
    } else {
      console.error('Ошибка регистрации:', error);
      res.status(500).json({ error: 'Внутренняя ошибка сервера' });
    }
  }
});

// Вход пользователя
app.post('/api/login', async (req, res) => {

  try {
    const { username, password } = req.body;

    if (!username || !password) {
      return res.status(400).json({ error: 'Все поля обязательны' });
    }

    const result = await pool.query(
      'SELECT * FROM users WHERE username = $1',
      [username]
    );

    if (result.rows.length === 0) {
      return res.status(401).json({ error: 'Неверное имя пользователя или пароль' });
    }

    const user = result.rows[0];

    const passwordMatch = await bcrypt.compare(password, user.password_hash);
    
    if (!passwordMatch) {
      return res.status(401).json({ error: 'Неверное имя пользователя или пароль' });
    }

    res.json({
      message: 'Вход выполнен успешно',
      user: {
        id: user.id,
        username: user.username,
        email: user.email,
        created_at: user.created_at
      }
    });
  } catch (error) {
    console.error('Ошибка входа:', error);

    res.status(500).json({ error: 'Внутренняя ошибка сервера' });
  }
});

// Получить всех пользователей
app.get('/api/users', async (req, res) => {
  try {
    const result = await pool.query('SELECT id, username, email, created_at FROM users');
    res.json(result.rows);
  } catch (error) {
    console.error('Ошибка получения пользователей:', error);
    res.status(500).json({ error: 'Внутренняя ошибка сервера' });
  }
});

// Получить список психотипов

app.get('/api/psychotypes', (req, res) => {
  res.json(PSYCHOTYPES);
});

// Чат с ИИ
app.post('/api/chat/ai', async (req, res) => {
  try {
    const { message, psychotype = 'empath' } = req.body;
    
    if (!message) {
      return res.status(400).json({ error: 'Сообщение обязательно' });
    }

    const selectedPsychotype = PSYCHOTYPES[psychotype] || PSYCHOTYPES.empath;

    const response = await fetch(DEEPSEEK_API_URL, {

      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${process.env.DEEPSEEK_API_KEY}`
      },
      body: JSON.stringify({
        model: 'deepseek-chat',
        messages: [
          {
            role: 'system',
            content: selectedPsychotype.system_prompt
          },
          {
            role: 'user', 
            content: message
          }
        ],
        max_tokens: 500,
        temperature: 0.7

      })
    });

    if (!response.ok) {
      throw new Error(`DeepSeek API error: ${response.status}`);
    }

    const data = await response.json();
    const aiResponse = data.choices[0].message.content;

    res.json({
      success: true,
      response: aiResponse,
      psychotype: selectedPsychotype.name
    });

  } catch (error) {
    console.error('Chat error:', error);
    res.status(500).json({ 

      error: 'Ошибка при общении с ИИ',
      details: error.message
    });
  }
});

// Проверка здоровья сервера
app.get('/api/health', async (req, res) => {
  try {
    const result = await pool.query('SELECT NOW()');
    res.json({ 
      status: 'OK', 
      database: 'Connected', 
      time: result.rows[0].now 
    });
  } catch (error) {
    res.status(500).json({ error: 'Database connection failed' });
  }
});


// Главная страница
app.get('/', (req, res) => {
  res.send('Привет! Уши на связи! 👂 Система работает!');
});

// ==================== SERVER START ====================
async function startServer() {
  try {
    console.log('🔄 Инициализация базы данных...');
    const dbInitialized = await initializeDatabase();
    
    if (dbInitialized) {
      app.listen(port, () => {
        console.log(`🚀 Сервер запущен на http://localhost:${port}`);
        console.log(`📊 Доступные 

endpoints:`);
        console.log(`   GET  /api/health`);
        console.log(`   GET  /api/psychotypes`);
        console.log(`   GET  /api/users`);
        console.log(`   POST /api/register`);
        console.log(`   POST /api/login`);
        console.log(`   POST /api/chat/ai`);
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
