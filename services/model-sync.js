// services/model-sync.js
// Синхронизация списка моделей из Ollama в БД при старте сервера.

const { pool } = require('../models/database');
const { AI_PROVIDERS, DEFAULT_MODEL } = require('./ai-providers');

const ollama = AI_PROVIDERS.ollama;

async function syncModelsFromAPI() {
    console.log('🔄 Опрос Ollama для списка моделей...');

    try {
        const models = await ollama.fetchModels();

        if (models.length === 0) {
            console.log('   ⚠️ Ollama: модели не найдены. Убедись что сервер запущен и модели скачаны (`ollama list`).');
            // Всё равно гарантируем наличие default-модели как плейсхолдера
            await pool.query(
                `INSERT INTO ai_models (id, provider_id, name, context_window)
                 VALUES ($1, 'ollama', $1, 8192)
                 ON CONFLICT (id) DO NOTHING`,
                [DEFAULT_MODEL]
            );
            return;
        }

        // Очищаем и пересинхрим
        await pool.query(`DELETE FROM ai_models WHERE provider_id = 'ollama'`);

        for (const m of models) {
            await pool.query(
                `INSERT INTO ai_models (id, provider_id, name, context_window)
                 VALUES ($1, 'ollama', $2, $3)
                 ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, context_window = EXCLUDED.context_window`,
                [m.id, m.name, m.context || 8192]
            );
        }

        console.log(`   ✅ Ollama: добавлено ${models.length} моделей.`);
    } catch (err) {
        console.error('   ❌ Sync failed:', err.message);
    }
}

module.exports = { syncModelsFromAPI };
