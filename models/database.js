// models/database.js
const { Pool } = require('pg');

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

        // === Users ===
        await pool.query(`
            CREATE TABLE IF NOT EXISTS users (
                id SERIAL PRIMARY KEY,
                username VARCHAR(50) UNIQUE NOT NULL,
                email VARCHAR(100) UNIQUE NOT NULL,
                password_hash VARCHAR(255) NOT NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        `);

        // === AI chat (1-to-1 with AI) ===
        await pool.query(`
            CREATE TABLE IF NOT EXISTS messages (
                id SERIAL PRIMARY KEY,
                user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
                message_text TEXT,
                ai_psychotype VARCHAR(50),
                is_ai_response BOOLEAN DEFAULT FALSE,
                media_url TEXT,
                media_type VARCHAR(50),
                sent_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        `);
        await pool.query(`CREATE INDEX IF NOT EXISTS idx_messages_user_sent ON messages (user_id, sent_at DESC)`);

        // === Live listeners (1-to-1 human chat) ===
        await pool.query(`
            CREATE TABLE IF NOT EXISTS ears (
                id SERIAL PRIMARY KEY,
                user_id INTEGER REFERENCES users(id) ON DELETE CASCADE UNIQUE NOT NULL,
                is_available BOOLEAN DEFAULT TRUE,
                rating DECIMAL(3,2) DEFAULT 5.0,
                sessions_completed INTEGER DEFAULT 0,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        `);

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

        await pool.query(`
            CREATE TABLE IF NOT EXISTS conversation_messages (
                id SERIAL PRIMARY KEY,
                conversation_id INTEGER REFERENCES conversations(id) ON DELETE CASCADE NOT NULL,
                sender_id INTEGER REFERENCES users(id) NOT NULL,
                message_text TEXT NOT NULL,
                media_url TEXT,
                media_type VARCHAR(50),
                transcribed_text TEXT,
                sent_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                is_read BOOLEAN DEFAULT FALSE
            )
        `);
        await pool.query(`CREATE INDEX IF NOT EXISTS idx_conv_msg_conv_sent ON conversation_messages (conversation_id, sent_at ASC)`);

        // === Group chat (N humans + optional AI) ===
        await pool.query(`
            CREATE TABLE IF NOT EXISTS rooms (
                id SERIAL PRIMARY KEY,
                name VARCHAR(120) NOT NULL,
                description TEXT,
                created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
                is_public BOOLEAN DEFAULT TRUE,
                ai_enabled BOOLEAN DEFAULT TRUE,
                ai_psychotype VARCHAR(50) DEFAULT 'empath',
                ai_model VARCHAR(100),
                ai_auto_respond BOOLEAN DEFAULT FALSE,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                is_active BOOLEAN DEFAULT TRUE
            )
        `);

        await pool.query(`
            CREATE TABLE IF NOT EXISTS room_participants (
                room_id INTEGER REFERENCES rooms(id) ON DELETE CASCADE,
                user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
                joined_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                left_at TIMESTAMP,
                role VARCHAR(20) DEFAULT 'member',
                PRIMARY KEY (room_id, user_id)
            )
        `);

        await pool.query(`
            CREATE TABLE IF NOT EXISTS room_messages (
                id SERIAL PRIMARY KEY,
                room_id INTEGER REFERENCES rooms(id) ON DELETE CASCADE NOT NULL,
                sender_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
                is_ai BOOLEAN DEFAULT FALSE,
                message_text TEXT,
                media_url TEXT,
                media_type VARCHAR(50),
                sent_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        `);
        await pool.query(`CREATE INDEX IF NOT EXISTS idx_room_msg_room_sent ON room_messages (room_id, sent_at ASC)`);
        await pool.query(`CREATE INDEX IF NOT EXISTS idx_room_participants_user ON room_participants (user_id)`);

        // === AI providers / models registry ===
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
                id VARCHAR(100) PRIMARY KEY,
                provider_id VARCHAR(50) REFERENCES ai_providers(id) ON DELETE CASCADE,
                name VARCHAR(150) NOT NULL,
                context_window INTEGER DEFAULT 8192
            )
        `);

        // === Миграции для старых БД ===
        try {
            await pool.query(`ALTER TABLE messages ADD COLUMN IF NOT EXISTS media_url TEXT`);
            await pool.query(`ALTER TABLE messages ADD COLUMN IF NOT EXISTS media_type VARCHAR(50)`);
            await pool.query(`ALTER TABLE messages ALTER COLUMN message_text DROP NOT NULL`);
            await pool.query(`ALTER TABLE conversation_messages ADD COLUMN IF NOT EXISTS media_url TEXT`);
            await pool.query(`ALTER TABLE conversation_messages ADD COLUMN IF NOT EXISTS media_type VARCHAR(50)`);
            await pool.query(`ALTER TABLE conversation_messages ADD COLUMN IF NOT EXISTS transcribed_text TEXT`);
            // Удаляем старых внешних провайдеров если есть
            await pool.query(`DELETE FROM ai_providers WHERE id IN ('openai','deepseek','google','grok','groq')`);
        } catch (e) {
            console.log('Migration note:', e.message);
        }

        // === Сеем единственный локальный провайдер ===
        await pool.query(
            `INSERT INTO ai_providers (id, name, base_url, api_key_env, enabled)
             VALUES ('ollama', 'Ollama (Local)', $1, NULL, true)
             ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, base_url = EXCLUDED.base_url, enabled = true`,
            [process.env.OLLAMA_URL || 'http://127.0.0.1:11434']
        );

        console.log('✅ Структура базы данных инициализирована');
        return true;
    } catch (error) {
        console.error('❌ Ошибка базы данных:', error.message);
        return false;
    }
}

module.exports = { pool, initializeDatabase };
