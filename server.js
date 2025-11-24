require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');

const app = express();
const port = process.env.PORT || 3000;

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

// ==================== TEMPORARY ROUTES FOR TESTING ====================
// Эти маршруты временные для тестирования фронтенда

// Маршрут для доступных "ушей"
app.get('/api/ears/available', (req, res) => {
    console.log('✅ Запрос на доступные уши');
    res.json([
        { id: 1, name: "Ухо 1", status: "available", type: "free" },
        { id: 2, name: "Ухо 2", status: "available", type: "premium" },
        { id: 3, name: "Ухо 3", status: "available", type: "free" }
    ]);
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
app.get('/api/ears/info', (req, res) => {
    res.json({ 
        totalListeners: 15,
        activeNow: 3,
        availableEars: 2,
        waitingUsers: 1
    });
});

// Serve the main HTML file
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'test1.html'));
});

// ==================== SERVER START ====================
const { initializeDatabase } = require('./models/database');
const { AI_PROVIDERS } = require('./services/ai-providers');

async function startServer() {
  try {
    console.log('🔄 Инициализация базы данных...');
    const dbInitialized = await initializeDatabase();
    
    if (dbInitialized) {
      app.listen(port, '0.0.0.0', () => {  // ← ИЗМЕНИ ЭТУ СТРОКУ
        console.log(`🚀 Сервер запущен на http://localhost:${port}`);
        console.log(`🌐 Доступен извне на http://ТВОЙ_IP:${port}`); // ← ДОБАВЬ ЭТУ СТРОКУ
        console.log(`📊 Модульная структура активирована`);
        // ... остальной вывод оставь как есть
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