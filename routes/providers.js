const express = require('express');
const router = express.Router();
const { PSYCHOTYPES } = require('../config/constants');
const { AI_PROVIDERS } = require('../services/ai-providers');

// Получить список психотипов
router.get('/psychotypes', (req, res) => {
  res.json(PSYCHOTYPES);
});

// Получить список доступных провайдеров
router.get('/providers', (req, res) => {
  try {
    const availableProviders = Object.entries(AI_PROVIDERS)
      .map(([key, provider]) => ({
        id: key,
        name: provider.name,
        enabled: provider.enabled,
        models: provider.models,
        defaultModel: provider.defaultModel
      }));
    
    res.json(availableProviders);
  } catch (error) {
    console.error('❌ Ошибка получения провайдеров:', error);
    res.status(500).json({ error: 'Ошибка получения списка провайдеров' });
  }
});

module.exports = router;
