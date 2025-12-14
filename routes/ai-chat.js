// routes/ai-chat.js
const express = require('express');
const router = express.Router();
const { authenticateToken } = require('../middleware/auth');
const aiService = require('../services/ai-chat-service');
const { pool } = require('../models/database'); // Импорт пула для очистки

// Обычный чат
router.post('/ai', authenticateToken, aiService.handleAIChat);

// Стрим чат
router.post('/ai/stream', authenticateToken, aiService.handleAIStream);

// История
router.get('/ai/history', authenticateToken, aiService.getChatHistory);

// 🔥 НОВЫЙ МАРШРУТ: Очистка истории
router.delete('/ai/history', authenticateToken, async (req, res) => {
    try {
        await pool.query('DELETE FROM messages WHERE user_id = $1', [req.user.id]);
        res.json({ success: true, message: 'История очищена' });
    } catch (error) {
        console.error('Clear History Error:', error);
        res.status(500).json({ error: 'Не удалось очистить историю' });
    }
});

module.exports = router;
