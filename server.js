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

app.use('/api', authRoutes);
app.use('/api/chat', aiChatRoutes);
app.use('/api', providersRoutes);

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
      app.listen(port, () => {
        console.log(`🚀 Сервер запущен на http://localhost:${port}`);
        console.log(`📊 Модульная структура активирована`);
        console.log(`📊 Доступные endpoints:`);
        console.log(`   GET  /api/health`);
        console.log(`   GET  /api/providers`);
        console.log(`   GET  /api/psychotypes`);
        console.log(`   GET  /api/users`);
        console.log(`   POST /api/register`);
        console.log(`   POST /api/login`);
        console.log(`   POST /api/chat/ai`);
        console.log(`   POST /api/chat/ai/stream`);
        
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