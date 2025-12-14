// routes/upload.js
const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const fs = require('fs'); // Обычный fs для синхронных операций
const fsPromises = require('fs').promises; // Для асинхронного чтения
const { authenticateToken } = require('../middleware/auth');
const { transcribeAudio } = require('../services/transcription-service');

// Настройка папки
const UPLOAD_DIR = path.join(__dirname, '../public/uploads/voice');
if (!fs.existsSync(UPLOAD_DIR)) {
    fs.mkdirSync(UPLOAD_DIR, { recursive: true });
}

// Конфигурация Multer (Сохранение на диск)
const storage = multer.diskStorage({
    destination: function (req, file, cb) {
        cb(null, UPLOAD_DIR);
    },
    filename: function (req, file, cb) {
        // Генерируем уникальное имя
        const ext = path.extname(file.originalname) || '.webm';
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        cb(null, uniqueSuffix + ext);
    }
});

const upload = multer({
    storage: storage,
    limits: { fileSize: 10 * 1024 * 1024 } // 10MB
});

// 📁 Просто загрузка (если нужно просто сохранить аудио без текста)
router.post('/audio', authenticateToken, upload.single('audio'), (req, res) => {
    if (!req.file) return res.status(400).json({ error: 'Файл не загружен' });
    
    res.json({
        success: true,
        url: `/uploads/voice/${req.file.filename}`,
        filename: req.file.filename,
        mimetype: req.file.mimetype
    });
});

// 🗣️ Загрузка + Транскрибация
router.post('/transcribe', authenticateToken, upload.single('audio'), async (req, res) => {
    try {
        if (!req.file) return res.status(400).json({ error: 'Файл не загружен' });

        // 1. Читаем файл с диска в буфер (это нужно для OpenAI SDK)
        const audioBuffer = await fsPromises.readFile(req.file.path);

        // 2. Отправляем в сервис транскрибации
        const transcription = await transcribeAudio(audioBuffer, req.file.filename);

        // 3. Возвращаем результат
        res.json({
            success: true,
            url: `/uploads/voice/${req.file.filename}`, // Ссылка для плеера
            text: transcription.text,
            language: transcription.language
        });

    } catch (error) {
        console.error('❌ Ошибка в роуте transcribe:', error);
        
        // Если произошла ошибка, можно попробовать удалить "битый" файл, чтобы не мусорить
        try {
            if (req.file) await fsPromises.unlink(req.file.path);
        } catch (e) { /* игнорируем ошибку удаления */ }

        res.status(500).json({ error: 'Ошибка обработки аудио: ' + error.message });
    }
});

module.exports = router;
