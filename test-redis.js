const RedisService = require('./services/redis');

async function testRedis() {
    console.log('🧪 Testing Redis schema...');
    
    // Тест пользователей
    await RedisService.setUserOnline('user1', 'socket123', { 
        username: 'testuser', 
        psychotype: 'empath' 
    });
    
    // Тест слушателей
    await RedisService.addActiveListener('user1', {
        specialties: ['depression', 'anxiety'],
        languages: ['ru', 'en']
    });
    
    // Тест рейтингов
    await RedisService.setListenerRating('user1', 4.8);
    await RedisService.incrementListenerRating('user1', 0.1);
    
    // Получение данных
    const listeners = await RedisService.getAvailableListeners();
    const stats = await RedisService.getStats();
    
    console.log('📊 Listeners:', listeners);
    console.log('📈 Stats:', stats);
}

testRedis().catch(console.error);