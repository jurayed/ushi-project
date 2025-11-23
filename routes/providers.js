const express = require('express');
const router = express.Router();
const { PSYCHOTYPES } = require('../config/constants');
const { AI_PROVIDERS } = require('../services/ai-providers');

// Получить список психотипов
router.get('/psychotypes', (req, res) => {
  res.json(PSYCHOTYPES);
});

// Получить список доступных провайдеров и их моделей
router.get('/providers', (req, res) => {
  const availableProviders = Object.entries(AI_PROVIDERS)
    .filter(([key, provider]) => provider.enabled)
    .map(([key, provider]) => ({
      id: key,
      name: provider.name,
      enabled: provider.enabled,
      models: provider.models,
      defaultModel: provider.defaultModel
    }));
  
  res.json(availableProviders);
});

module.exports = router;