const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const fs = require('fs').promises; // Используем Promise версию fs
const fsSync = require('fs'); // Для createReadStream если нужно, и проверки папок
const { authenticateToken } = require('../middleware/auth');
const { transcribeAudio } = require('../services/transcription-service');

// Настройка папки
const UPLOAD_DIR = path.join(__dirname, '../public/uploads/voice');
if (!fsSync.existsSync(UPLOAD_DIR)) {
    fsSync.mkdirSync(UPLOAD_DIR, { recursive: true });
}

// Конфигурация Multer
const storage = multer.diskStorage({
    destination: function (req, file, cb) {
        cb(null, UPLOAD_DIR);
    },
    filename: function (req, file, cb) {
        const ext = path.extname(file.originalname) || '.webm';
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        cb(null, uniqueSuffix + ext);
    }
});

const upload = multer({
    storage: storage,
    limits: { fileSize: 10 * 1024 * 1024 } // 10MB
});

// 📁 Просто загрузка
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

        // Асинхронное чтение файла (не блокирует сервер)
        const audioBuffer = await fs.readFile(req.file.path);

        // Транскрибация
        const transcription = await transcribeAudio(audioBuffer, req.file.filename);

        res.json({
            success: true,
            url: `/uploads/voice/${req.file.filename}`,
            text: transcription.text,
            language: transcription.language
        });
    } catch (error) {
        console.error('❌ Ошибка транскрибации:', error);
        res.status(500).json({ error: 'Ошибка транскрибации: ' + error.message });
    }
});

module.exports = router;
