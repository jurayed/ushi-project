// routes/providers.js
const express = require('express');
const router = express.Router();
const { pool } = require('../models/database');

router.get('/providers', async (req, res) => {
    try {
        // 1. Получаем активных провайдеров
        const providersRes = await pool.query('SELECT * FROM ai_providers WHERE enabled = true');
        const providers = providersRes.rows;

        if (providers.length === 0) {
            return res.json([]);
        }

        // 2. Получаем все модели
        const modelsRes = await pool.query('SELECT * FROM ai_models');
        const models = modelsRes.rows;

        // 3. Собираем красивую структуру для фронтенда
        const result = providers.map(p => {
            const pModels = {};
            
            // Фильтруем модели только этого провайдера
            models.filter(m => m.provider_id === p.id).forEach(m => {
                pModels[m.id] = {
                    name: m.name,
                    context: m.context_window
                };
            });

            return {
                id: p.id,
                name: p.name,
                enabled: p.enabled,
                models: pModels,
                // Если есть модели, берем первую как дефолтную, иначе null
                defaultModel: Object.keys(pModels).length > 0 ? Object.keys(pModels)[0] : null
            };
        });

        res.json(result);
    } catch (error) {
        console.error('Providers Error:', error);
        res.status(500).json({ error: 'Database error fetching providers' });
    }
});

module.exports = router;
