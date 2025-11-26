const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { authenticateToken } = require('../middleware/auth');
const { transcribeAudio } = require('../services/transcription-service');

// Настройка хранилища для multer
const storage = multer.diskStorage({
    destination: function (req, file, cb) {
        const uploadDir = path.join(__dirname, '../public/uploads/voice');
        // Создаем директорию, если она не существует
        if (!fs.existsSync(uploadDir)) {
            fs.mkdirSync(uploadDir, { recursive: true });
        }
        cb(null, uploadDir);
    },
    filename: function (req, file, cb) {
        // Генерируем уникальное имя файла: timestamp-random.webm
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        cb(null, uniqueSuffix + '.webm'); // Мы будем отправлять webm/audio
    }
});

const upload = multer({
    storage: storage,
    limits: {
        fileSize: 10 * 1024 * 1024 // Ограничение 10MB
    }
});

// Маршрут для загрузки аудио
router.post('/audio', authenticateToken, upload.single('audio'), (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({ error: 'Файл не загружен' });
        }

        // Формируем URL для доступа к файлу
        // Путь относительно public директории
        const fileUrl = `/uploads/voice/${req.file.filename}`;

        res.json({
            success: true,
            url: fileUrl,
            filename: req.file.filename,
            mimetype: req.file.mimetype,
            size: req.file.size
        });
    } catch (error) {
        console.error('Ошибка при загрузке файла:', error);
        res.status(500).json({ error: 'Ошибка сервера при загрузке файла' });
    }
});

// Transcription endpoint
router.post('/transcribe', authenticateToken, upload.single('audio'), async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({ error: 'Файл не загружен' });
        }

        console.log('🎙️ Starting audio transcription...');

        // Read the file buffer
        const audioBuffer = fs.readFileSync(req.file.path);

        // Transcribe using OpenAI Whisper
        const transcription = await transcribeAudio(audioBuffer, req.file.filename);

        // Return both file URL and transcribed text
        const fileUrl = `/uploads/voice/${req.file.filename}`;

        res.json({
            success: true,
            url: fileUrl,
            text: transcription.text,
            language: transcription.language,
            filename: req.file.filename
        });
    } catch (error) {
        console.error('❌ Transcription error:', error);
        res.status(500).json({ error: 'Ошибка транскрибации: ' + error.message });
    }
});

module.exports = router;
