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

    // 3. Таблица слушателей ("Уши")
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

    // 4. Таблица сессий (Диалоги людей)
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

    // 5. Таблица сообщений внутри сессий
    // ВАЖНО: Добавил media_url и media_type сразу сюда
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

    // === МИГРАЦИИ (Обновление старых таблиц, если они уже созданы) ===
    // Это спасет ситуацию, если база уже была создана без этих полей
    try {
      await pool.query('ALTER TABLE conversation_messages ADD COLUMN IF NOT EXISTS media_url TEXT');
      await pool.query('ALTER TABLE conversation_messages ADD COLUMN IF NOT EXISTS media_type VARCHAR(50)');
      await pool.query('ALTER TABLE conversation_messages ADD COLUMN IF NOT EXISTS transcribed_text TEXT');
    } catch (e) {
      console.log('Migration note:', e.message);
    }

    console.log('✅ Структура базы данных инициализирована');
    return true;
  } catch (error) {
    console.error('❌ Ошибка базы данных:', error.message);
    return false;
  }
}

module.exports = { pool, initializeDatabase };
