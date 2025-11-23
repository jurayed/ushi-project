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