// routes/providers.js
// Возвращает единственный локальный провайдер (Ollama) + список моделей.

const express = require('express');
const router = express.Router();
const { pool } = require('../models/database');
const { DEFAULT_MODEL } = require('../services/ai-providers');

router.get('/providers', async (req, res) => {
    try {
        const providersRes = await pool.query(
            `SELECT * FROM ai_providers WHERE enabled = true`
        );
        const providers = providersRes.rows;
        if (providers.length === 0) return res.json([]);

        const modelsRes = await pool.query(`SELECT * FROM ai_models`);
        const models = modelsRes.rows;

        const result = providers.map(p => {
            const pModels = {};
            models
                .filter(m => m.provider_id === p.id)
                .forEach(m => {
                    pModels[m.id] = {
                        name: m.name,
                        context: m.context_window
                    };
                });

            const defaultModel = pModels[DEFAULT_MODEL]
                ? DEFAULT_MODEL
                : (Object.keys(pModels)[0] || null);

            return {
                id: p.id,
                name: p.name,
                enabled: p.enabled,
                models: pModels,
                defaultModel
            };
        });

        res.json(result);
    } catch (err) {
        console.error('Providers Error:', err);
        res.status(500).json({ error: 'Database error fetching providers' });
    }
});

module.exports = router;
