// models/database.js
const { Pool } = require('pg');

// Подключение к БД
const pool = new Pool({
  host: process.env.DB_HOST,
  port: process.env.DB_PORT,
  database: process.env.DB_NAME,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
});

async function initializeDatabase() {
  try {
    const client = await pool.connect();
    console.log('🔌 База данных подключена успешно');
    client.release();

    // 1. Таблица пользователей
    await pool.query(`
      CREATE TABLE IF NOT EXISTS users (
        id SERIAL PRIMARY KEY,
        username VARCHAR(50) UNIQUE NOT NULL,
        email VARCHAR(100) UNIQUE NOT NULL,
        password_hash VARCHAR(255) NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // 2. Таблица сообщений ИИ (Чат с ботом)
    // ДОБАВИЛ media_url и media_type сюда тоже
    await pool.query(`
      CREATE TABLE IF NOT EXISTS messages (
        id SERIAL PRIMARY KEY,
        user_id INTEGER REFERENCES users(id),
        message_text TEXT,
        ai_psychotype VARCHAR(50),
        is_ai_response BOOLEAN DEFAULT FALSE,
        media_url TEXT,
        media_type VARCHAR(50),
        sent_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // 3. Таблица слушателей ("Уши") - ТВОЯ ВЕРСИЯ
    await pool.query(`
      CREATE TABLE IF NOT EXISTS ears (
        id SERIAL PRIMARY KEY,
        user_id INTEGER REFERENCES users(id) UNIQUE NOT NULL,
        is_available BOOLEAN DEFAULT TRUE,
        rating DECIMAL(3,2) DEFAULT 5.0,
        sessions_completed INTEGER DEFAULT 0,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // 4. Таблица сессий (Диалоги людей) - ТВОЯ ВЕРСИЯ
    await pool.query(`
      CREATE TABLE IF NOT EXISTS conversations (
        id SERIAL PRIMARY KEY,
        user_id INTEGER REFERENCES users(id) NOT NULL,
        ear_id INTEGER REFERENCES ears(id) NOT NULL,
        status VARCHAR(20) DEFAULT 'active',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        ended_at TIMESTAMP,
        user_rating INTEGER,
        ear_rating INTEGER
      )
    `);

    // 5. Таблица сообщений внутри сессий - ТВОЯ ВЕРСИЯ
    await pool.query(`
      CREATE TABLE IF NOT EXISTS conversation_messages (
        id SERIAL PRIMARY KEY,
        conversation_id INTEGER REFERENCES conversations(id) NOT NULL,
        sender_id INTEGER REFERENCES users(id) NOT NULL,
        message_text TEXT NOT NULL,
        media_url TEXT,
        media_type VARCHAR(50),
        transcribed_text TEXT,
        sent_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        is_read BOOLEAN DEFAULT FALSE
      )
    `);

    // 6. 🔥 НОВЫЕ ТАБЛИЦЫ ДЛЯ ПРОВАЙДЕРОВ (Groq, xAI и т.д.)
    await pool.query(`
      CREATE TABLE IF NOT EXISTS ai_providers (
        id VARCHAR(50) PRIMARY KEY,
        name VARCHAR(100) NOT NULL,
        base_url TEXT,
        api_key_env VARCHAR(100),
        enabled BOOLEAN DEFAULT true
      )
    `);

    await pool.query(`
      CREATE TABLE IF NOT EXISTS ai_models (
        id VARCHAR(50) PRIMARY KEY,
        provider_id VARCHAR(50) REFERENCES ai_providers(id) ON DELETE CASCADE,
        name VARCHAR(100) NOT NULL,
        context_window INTEGER DEFAULT 4096
      )
    `);

    // === МИГРАЦИИ (Добавление колонок в старые таблицы) ===
    try {
      // Для чата людей
      await pool.query('ALTER TABLE conversation_messages ADD COLUMN IF NOT EXISTS media_url TEXT');
      await pool.query('ALTER TABLE conversation_messages ADD COLUMN IF NOT EXISTS media_type VARCHAR(50)');
      await pool.query('ALTER TABLE conversation_messages ADD COLUMN IF NOT EXISTS transcribed_text TEXT');
      
      // 🔥 Для чата с ИИ (Критично для голосовых)
      await pool.query('ALTER TABLE messages ADD COLUMN IF NOT EXISTS media_url TEXT');
      await pool.query('ALTER TABLE messages ADD COLUMN IF NOT EXISTS media_type VARCHAR(50)');
      // Разрешаем message_text быть NULL (если это чисто голосовое без текста, хотя у нас всегда есть транскрипция)
      await pool.query('ALTER TABLE messages ALTER COLUMN message_text DROP NOT NULL');
    } catch (e) {
      console.log('Migration note:', e.message);
    }

    // ТОЛЬКО ПРОВАЙДЕРЫ (БЕЗ МОДЕЛЕЙ)
    const providers = [
        ['openai', 'OpenAI', 'https://api.openai.com/v1', 'OPENAI_API_KEY'],
        ['deepseek', 'DeepSeek', 'https://api.deepseek.com', 'DEEPSEEK_API_KEY'],
        ['google', 'Google Gemini', 'https://generativelanguage.googleapis.com/v1beta', 'GOOGLE_API_KEY'],
        ['grok', 'xAI (Grok)', 'https://api.x.ai/v1', 'XAI_API_KEY'],
        ['groq', 'Groq (Ultra Fast)', 'https://api.groq.com/openai/v1', 'GROQ_API_KEY']
    ];

    for (const p of providers) {
        await pool.query(
            `INSERT INTO ai_providers (id, name, base_url, api_key_env) VALUES ($1, $2, $3, $4) ON CONFLICT (id) DO NOTHING`,
            p
        );
    }

    console.log('✅ Структура базы данных инициализирована');
    return true;
  } catch (error) {
    console.error('❌ Ошибка базы данных:', error.message);
    return false;
  }
}

module.exports = { pool, initializeDatabase };
