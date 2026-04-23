require('dotenv').config();

const express = require('express');
const cors = require('cors');
const path = require('path');
const http = require('http');

// Импорт сервисов и БД
const { authenticateToken } = require('./middleware/auth');
const RedisService = require('./services/redis');
const SocketService = require('./services/socket-service');
const { initializeDatabase, pool } = require('./models/database'); // pool нужен здесь пока мы не перенесли профиль
const { AI_PROVIDERS } = require('./services/ai-providers');
const { syncModelsFromAPI } = require('./services/model-sync'); // 👈 ИМПОРТ

// Создание приложения
const app = express();
const server = http.createServer(app);
const port = process.env.PORT || 3000;

// ==================== CONFIGURATION CHECK ====================
if (!process.env.JWT_SECRET) {
  console.error('❌ FATAL: JWT_SECRET не установлен в .env');
  process.exit(1);
}

// ==================== MIDDLEWARE ====================
// Настройка CORS (разрешаем запросы, в продакшене лучше указать конкретный домен вместо *)
app.use(cors({
  origin: process.env.CORS_ORIGIN || '*', 
  methods: ['GET', 'POST', 'PUT', 'DELETE'],
  allowedHeaders: ['Content-Type', 'Authorization', 'bypass-tunnel-reminder']
}));

// Парсинг JSON и URL-encoded данных
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Статика (фронтенд)
app.use(express.static('public'));

// LocalTunnel fix (можно удалить, если не используешь LT, но пока оставим аккуратно)
app.use((req, res, next) => {
  res.setHeader('bypass-tunnel-reminder', 'true');
  next();
});

// ==================== ROUTES IMPORTS ====================
const authRoutes = require('./routes/auth');
const providersRoutes = require('./routes/providers');
const aiChatRoutes = require('./routes/ai-chat');
const liveEarsRoutes = require('./routes/live-ears');
const uploadRoutes = require('./routes/upload');
const ttsRoutes = require('./routes/tts');
const roomsRoutes = require('./routes/rooms');

// Подключение API маршрутов
app.use('/api', authRoutes);
app.use('/api', providersRoutes);
app.use('/api/chat', aiChatRoutes);
app.use('/api', liveEarsRoutes);
app.use('/api/upload', uploadRoutes);
app.use('/api', ttsRoutes);
app.use('/api', roomsRoutes);

// --- ВРЕМЕННЫЕ МАРШРУТЫ (Лучше перенести их в отдельные контроллеры позже) ---

// Профиль пользователя
app.get('/api/profile', authenticateToken, async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT id, username, email, created_at FROM users WHERE id = $1',
      [req.user.id]
    );
    if (result.rows.length === 0) return res.status(404).json({ error: 'Пользователь не найден' });
    res.json(result.rows[0]);
  } catch (error) {
    console.error('Ошибка профиля:', error);
    res.status(500).json({ error: 'Server Error' });
  }
});

// Статистика Redis
app.get('/api/stats', async (req, res) => {
  try {
    const stats = await RedisService.getStats();
    res.json(stats);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Проверка здоровья сервера
app.get('/api/health', (req, res) => {
  res.json({ status: 'OK', uptime: process.uptime(), time: new Date().toISOString() });
});

// Главная страница
app.get('*', (req, res) => {
  // Если запрос не попал в API и не статика - отдаем index.html (для SPA приложений)
  if (!req.path.startsWith('/api')) {
      res.sendFile(path.join(__dirname, 'public', 'index.html'));
  } else {
      res.status(404).json({ error: 'API endpoint not found' });
  }
});

// ==================== STARTUP ====================
async function startServer() {
  try {
    console.clear(); // Очистить консоль для красоты
    console.log('🔄 Запуск системы Ushi Project...');
    
    // 1. БД
    const dbInitialized = await initializeDatabase();
    if (!dbInitialized) throw new Error('DB Init Failed');

	// 2. 🔥 СИНХРОНИЗАЦИЯ МОДЕЛЕЙ (ОНЛАЙН)
    // Ждем выполнения, чтобы при старте настройки уже были полными
    await syncModelsFromAPI();
	
    // 3. WebSocket
    SocketService.initialize(server);

    // 4. Запуск слушателя
    server.listen(port, '0.0.0.0', () => {
      console.log('\n✅ СИСТЕМА ЗАПУЩЕНА УСПЕШНО');
      console.log(`📡 URL: http://localhost:${port}`);
      console.log(`🔌 WebSocket: Active`);
      
      // Краткая сводка по AI
      console.log('\n🤖 Активные AI провайдеры:');
      Object.values(AI_PROVIDERS).filter(p => p.enabled).forEach(p => {
        console.log(`   — ${p.name} [${Object.keys(p.models).length} моделей]`);
      });
      console.log('\n___________________________________________________\n');
    });

  } catch (error) {
    console.error('❌ Ошибка запуска сервера:', error);
    process.exit(1);
  }
}

startServer();
