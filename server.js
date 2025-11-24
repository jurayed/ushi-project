require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
const http = require('http');

const app = express();
const server = http.createServer(app);
const port = process.env.PORT || 3000;

// ==================== SERVICES ====================
const RedisService = require('./services/redis');
const SocketService = require('./services/socket-service');

// ==================== ENVIRONMENT VARIABLES CHECK ====================
console.log('🔧 Проверка переменных окружения:');
console.log('   PORT:', process.env.PORT);
console.log('   DB_HOST:', process.env.DB_HOST);
console.log('   DB_PORT:', process.env.DB_PORT);
console.log('   DB_NAME:', process.env.DB_NAME);
console.log('   DB_USER:', process.env.DB_USER);
console.log('   JWT_SECRET:', process.env.JWT_SECRET ? '***установлен***' : '❌ отсутствует');
console.log('   DEEPSEEK_API_KEY:', process.env.DEEPSEEK_API_KEY ? '***установлен***' : '❌ отсутствует');
console.log('   OPENAI_API_KEY:', process.env.OPENAI_API_KEY ? '***установлен***' : '❌ отсутствует');
console.log('   GOOGLE_API_KEY:', process.env.GOOGLE_API_KEY ? '***установлен***' : '❌ отсутствует');

// Проверяем обязательные переменные
if (!process.env.JWT_SECRET) {
  console.error('❌ КРИТИЧЕСКАЯ ОШИБКА: JWT_SECRET не установлен в .env файле');
  process.exit(1);
}

// ==================== MIDDLEWARE ====================
app.use(cors({
  origin: '*',
  methods: ['GET', 'POST', 'PUT', 'DELETE'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// ==================== ROUTES ====================
const authRoutes = require('./routes/auth');
const aiChatRoutes = require('./routes/ai-chat');
const providersRoutes = require('./routes/providers');
const liveEarsRoutes = require('./routes/live-ears');

app.use('/api', authRoutes);
app.use('/api/chat', aiChatRoutes);
app.use('/api', providersRoutes);
app.use('/api', liveEarsRoutes);

// ==================== REDIS STATISTICS ROUTE ====================
app.get('/api/stats', async (req, res) => {
    try {
        const stats = await RedisService.getStats();
        res.json(stats);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// ==================== TEMPORARY ROUTES FOR TESTING ====================
// Эти маршруты временные для тестирования фронтенда

// Маршрут для доступных "ушей"
app.get('/api/ears/available', async (req, res) => {
    try {
        console.log('✅ Запрос на доступные уши');
        const availableListeners = await RedisService.getAvailableListeners();
        res.json(availableListeners);
    } catch (error) {
        console.error('❌ Ошибка получения слушателей:', error);
        res.status(500).json({ error: 'Ошибка получения списка слушателей' });
    }
});

// Маршрут для поиска разговоров
app.post('/api/conversations/find', (req, res) => {
    console.log('✅ Поиск разговора', req.body);
    res.json({ 
        found: true, 
        conversationId: "conv_" + Date.now(),
        earId: 1,
        earName: "Ухо 1"
    });
});

// Маршрут для информации о слушателях
app.get('/api/ears/info', async (req, res) => {
    try {
        const stats = await RedisService.getStats();
        res.json({ 
            totalListeners: stats.totalListeners,
            activeNow: stats.totalOnline,
            availableEars: stats.totalListeners,
            waitingUsers: 0
        });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Serve the main HTML file
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'test1.html'));
});

// Serve ngrok test page
app.get('/ngrok-test', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'ngrok-test.html'));
});

// ==================== SERVER START ====================
const { initializeDatabase } = require('./models/database');
const { AI_PROVIDERS } = require('./services/ai-providers');

async function startServer() {
  try {
    console.log('🔄 Инициализация базы данных...');
    const dbInitialized = await initializeDatabase();
    
    if (dbInitialized) {
      // Инициализируем Socket.IO
      SocketService.initialize(server);
      
      server.listen(port, '0.0.0.0', () => {
        console.log(`🚀 Сервер запущен на http://localhost:${port}`);
        console.log(`🌐 Доступен извне на http://ТВОЙ_IP:${port}`);
        console.log(`📊 Модульная структура активирована`);
        console.log(`🔌 WebSocket сервер запущен`);
        console.log(`📊 Доступные endpoints:`);
        console.log(`   GET  /api/health`);
        console.log(`   GET  /api/providers`);
        console.log(`   GET  /api/psychotypes`);
        console.log(`   GET  /api/users`);
        console.log(`   POST /api/register`);
        console.log(`   POST /api/login`);
        console.log(`   POST /api/chat/ai`);
        console.log(`   POST /api/chat/ai/stream`);
        console.log(`   GET  /api/stats`);
        console.log(`   GET  /api/ears/available`);
        
        // Показываем доступные провайдеры и модели
        console.log(`🤖 Доступные AI провайдеры и модели:`);
        Object.entries(AI_PROVIDERS).forEach(([key, provider]) => {
            console.log(`   - ${provider.name}: ${provider.enabled ? '✅' : '❌'}`);
            if (provider.enabled) {
                Object.entries(provider.models).forEach(([modelKey, modelInfo]) => {
                    console.log(`     * ${modelKey}: ${modelInfo.name} (${modelInfo.context} tokens)`);
                });
            }
        });
      });
    } else {
      console.log('❌ Не удалось инициализировать базу данных. Сервер не запущен.');
    }
  } catch (error) {
    console.error('❌ Ошибка запуска сервера:', error);
  }
}

// Запускаем сервер
startServer();