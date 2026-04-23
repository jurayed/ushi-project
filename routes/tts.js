// routes/tts.js
// POST /api/tts — синтез речи по тексту. Возвращает аудио-поток (wav/mp3).
// Используется фронтом для озвучивания ответов AI.

const express = require('express');
const router = express.Router();
const { authenticateToken } = require('../middleware/auth');
const { synthesizeToBuffer } = require('../services/tts-service');

router.post('/tts', authenticateToken, async (req, res) => {
    try {
        const { text, language, voice } = req.body;
        if (!text || !text.trim()) return res.status(400).json({ error: 'Empty text' });

        const { buffer, ext } = await synthesizeToBuffer(text, { language, voice });
        const mime = ext === 'mp3' ? 'audio/mpeg' : 'audio/wav';

        res.setHeader('Content-Type', mime);
        res.setHeader('Cache-Control', 'no-store');
        res.send(buffer);
    } catch (err) {
        console.error('TTS route error:', err.message);
        res.status(500).json({ error: err.message });
    }
});

module.exports = router;
