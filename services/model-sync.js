// services/model-sync.js
const { pool } = require('../models/database');
const { AI_PROVIDERS } = require('./ai-providers');

async function syncModelsFromAPI() {
    console.log('🔄 Синхронизация моделей с API провайдеров...');

    for (const [providerId, provider] of Object.entries(AI_PROVIDERS)) {
        try {
            // 1. Получаем список моделей от провайдера
            console.log(`   📡 Опрос ${provider.name}...`);
            const models = await provider.fetchModels();

            if (models.length === 0) {
                console.log(`   ⚠️ ${provider.name}: модели не найдены (проверьте API Key).`);
                continue;
            }

            // 2. Очищаем старые модели этого провайдера (чтобы удалить deprecated)
            await pool.query('DELETE FROM ai_models WHERE provider_id = $1', [providerId]);

            // 3. Записываем новые
            for (const model of models) {
                await pool.query(
                    `INSERT INTO ai_models (id, provider_id, name, context_window) 
                     VALUES ($1, $2, $3, $4)
                     ON CONFLICT (id) DO NOTHING`,
                    [model.id, providerId, model.name, model.context || 4096]
                );
            }
            console.log(`   ✅ ${provider.name}: обновлено ${models.length} моделей.`);

        } catch (error) {
            console.error(`   ❌ Ошибка синхронизации ${provider.name}:`, error.message);
        }
    }
    console.log('🏁 Синхронизация завершена.');
}

module.exports = { syncModelsFromAPI };
