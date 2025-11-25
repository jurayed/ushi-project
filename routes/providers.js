const express = require('express');
const router = express.Router();
const { PSYCHOTYPES } = require('../config/constants');
const { AI_PROVIDERS } = require('../services/ai-providers');

// Получить список психотипов
router.get('/psychotypes', (req, res) => {
  console.log('✅ Запрос на получение психотипов');
  res.json(PSYCHOTYPES);
});

// Получить список доступных провайдеров и их моделей
router.get('/providers', (req, res) => {
  try {
    console.log('✅ Запрос на получение провайдеров');
    
    const availableProviders = Object.entries(AI_PROVIDERS)
      .map(([key, provider]) => ({
        id: key,
        name: provider.name,
        enabled: provider.enabled,
        models: provider.models,
        defaultModel: provider.defaultModel
      }));
    
    console.log(`📊 Отправлено провайдеров: ${availableProviders.length}`);
    console.log('🔧 Доступные провайдеры:', availableProviders.map(p => `${p.name} (${p.id}): ${p.enabled ? '✅' : '❌'}`));
    
    res.json(availableProviders);
  } catch (error) {
    console.error('❌ Ошибка получения провайдеров:', error);
    res.status(500).json({ error: 'Ошибка получения списка провайдеров' });
  }
});

// Health check endpoint
router.get('/health', (req, res) => {
  res.json({ 
    status: 'OK', 
    timestamp: new Date().toISOString(),
    providers: Object.keys(AI_PROVIDERS).length
  });
});

module.exports = router;