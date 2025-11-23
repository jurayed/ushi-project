const express = require('express');
const router = express.Router();
const { authenticateToken } = require('../middleware/auth');
const { handleAIChat, handleAIStream } = require('../services/ai-chat-service');

// Чат с ИИ с поддержкой выбора модели
router.post('/ai', authenticateToken, handleAIChat);

// Потоковый чат с ИИ
router.post('/ai/stream', authenticateToken, handleAIStream);

module.exports = router;