const { Pool } = require('pg');

// ==================== DATABASE CONNECTION ====================
const pool = new Pool({
  host: process.env.DB_HOST,
  port: process.env.DB_PORT,
  database: process.env.DB_NAME,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
});

// ==================== DATABASE INITIALIZATION ====================
async function initializeDatabase() {
  try {
    console.log('🔌 Проверяем подключение к базе данных...');
    
    // Простая проверка подключения
    const client = await pool.connect();
    console.log('✅ Подключение к базе данных успешно');
    client.release();

    console.log('🔄 Создаем таблицы...');
    
    // Таблица пользователей
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

    // Таблица сообщений ИИ
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

    // Таблица слушателей (добровольцев)
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
    console.log('✅ Таблица ears создана/проверена');
	
	// Таблица сессий (разговоров)
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
    console.log('✅ Таблица conversations создана/проверена');

    // Таблица сообщений в сессиях
    await pool.query(`
      CREATE TABLE IF NOT EXISTS conversation_messages (
        id SERIAL PRIMARY KEY,
        conversation_id INTEGER REFERENCES conversations(id) NOT NULL,
        sender_id INTEGER REFERENCES users(id) NOT NULL,
        message_text TEXT NOT NULL,
        sent_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        is_read BOOLEAN DEFAULT FALSE
      )
    `);
    console.log('✅ Таблица conversation_messages создана/проверена');
	
	console.log('✅ Все таблицы базы данных созданы/проверены');
    return true;
  } catch (error) {
    console.error('❌ Критическая ошибка базы данных:', error);
    console.error('🔧 Детали ошибки:', error.message);
    return false;
  }
}

module.exports = {
  pool,
  initializeDatabase
};
// Run database column migration for transcribed_text on startup
(async () => {
  try {
    await pool.query('ALTER TABLE messages ADD COLUMN IF NOT EXISTS media_url TEXT');
    await pool.query('ALTER TABLE messages ADD COLUMN IF NOT EXISTS media_type VARCHAR(50)');
    await pool.query('ALTER TABLE messages ADD COLUMN IF NOT EXISTS transcribed_text TEXT');
    console.log('? Database columns migrated');
  } catch (err) {
    console.log('Note: Column migration check:', err.message);
  }
})();
