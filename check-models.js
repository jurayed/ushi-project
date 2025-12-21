// check-models.js
require('dotenv').config();
const fs = require('fs');
const { AI_PROVIDERS } = require('./services/ai-providers'); // Убедитесь, что путь правильный

// Функция задержки, чтобы не словить Rate Limit
const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));

async function checkModels() {
    const results = {};
    const brokenModels = [];

    console.log('🚀 Начинаем проверку моделей...\n');

    for (const [providerId, provider] of Object.entries(AI_PROVIDERS)) {
        console.log(`--- Проверка провайдера: ${provider.name} ---`);
        
        // 1. Получаем список моделей
        let models = [];
        try {
            models = await provider.fetchModels();
            console.log(`Найдено моделей: ${models.length}`);
        } catch (e) {
            console.error(`❌ Ошибка получения списка моделей для ${providerId}:`, e.message);
            continue;
        }

        results[providerId] = { working: [], broken: [] };

        // 2. Тестируем каждую модель
        for (const model of models) {
            process.stdout.write(`Testing ${model.id}... `);
            
            try {
                // Пытаемся отправить минимальный запрос
                // Используем таймаут, чтобы не висеть вечно на сломанных моделях
                const testPromise = provider.chat(
                    'You are a test bot.', 
                    [{ role: 'user', content: 'Hi' }], 
                    model.id
                );
                
                // Таймаут 10 секунд
                const timeoutPromise = new Promise((_, reject) => 
                    setTimeout(() => reject(new Error('Timeout')), 15000)
                );

                await Promise.race([testPromise, timeoutPromise]);
                
                console.log('✅ OK');
                results[providerId].working.push(model.id);
            } catch (e) {
                console.log(`❌ FAIL (${e.message})`);
                results[providerId].broken.push(model.id);
                brokenModels.push(model.id);
            }

            // Пауза между запросами (важно для API лимитов!)
            await delay(1000); 
        }
        console.log('\n');
    }

    // 3. Сохраняем результаты
    console.log('-----------------------------------');
    console.log(`Всего проверено. Нерабочих моделей: ${brokenModels.length}`);
    
    const outputContent = `// Список автоматически определенных нерабочих моделей\n` +
                          `// Сгенерировано: ${new Date().toLocaleString()}\n` +
                          `module.exports = ${JSON.stringify(brokenModels, null, 2)};`;

    fs.writeFileSync('./services/broken-models.js', outputContent);
    console.log('💾 Список нерабочих моделей сохранен в services/broken-models.js');
}

checkModels();
