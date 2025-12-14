// services/ai-providers.js
const { OpenAI } = require('openai');
const { GoogleGenerativeAI } = require('@google/generative-ai');

// Фильтр моделей с расширенным списком исключений
function filterLLMModels(models, providerId) {
    if (!models || models.length === 0) return [];
    
    // Ключевые слова для исключения
    const excludeKeywords = [
        'coder', 'vision', 'instruct', 'preview', 'embedding', 
        'image', 'tts', 'search', 'whisper', 'audio', '2024', 
        'experimental'
    ];
    
    // Фильтрация
    let filtered = models.filter(model => {
        const id = model.id.toLowerCase();
        const name = model.name?.toLowerCase() || '';
        
        // Исключаем модели, содержащие ключевые слова
        if (excludeKeywords.some(keyword => 
            id.includes(keyword) || name.includes(keyword))) {
            return false;
        }
        
        // Для Google дополнительно исключаем некоторые специализированные модели
        if (providerId === 'google') {
            // Исключаем модели с 'imagen', 'veo', 'aqa', 'robotics' в имени
            const googleExclude = ['imagen', 'veo', 'aqa', 'robotics', 'computer-use'];
            if (googleExclude.some(keyword => id.includes(keyword) || name.includes(keyword))) {
                return false;
            }
        }
        
        return true;
    });
    
    // Сортировка по алфавиту для порядка
    filtered.sort((a, b) => a.id.localeCompare(b.id));
    
    // Удаление дубликатов по короткому имени
    const seen = new Set();
    filtered = filtered.filter(model => {
        const shortName = model.id.split('/').pop().split(':')[0];
        if (seen.has(shortName)) return false;
        seen.add(shortName);
        return true;
    });
    
    return filtered;
}

// Хелпер для получения списка моделей через OpenAI-compatible API
async function fetchOpenAIModels(apiKey, baseURL) {
    if (!apiKey) return [];
    try {
        const client = new OpenAI({ apiKey, baseURL });
        const list = await client.models.list();
        return list.data.map(m => ({
            id: m.id,
            name: m.id,
            context: 128000
        }));
    } catch (e) {
        console.error(`Ошибка получения моделей с ${baseURL}:`, e.message);
        return [];
    }
}

// Хелпер для получения списка моделей Google Gemini (специфичный API)
async function fetchGoogleModels(apiKey) {
    if (!apiKey) return [];
    try {
        const url = `https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`;
        const response = await fetch(url);
        
        if (!response.ok) {
            throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }
        
        const data = await response.json();
        
        // Базовая фильтрация: только модели с generateContent
        const filteredModels = data.models
            .filter(model => model.supportedGenerationMethods?.includes('generateContent'))
            .map(model => {
                const shortName = model.name.split('/').pop();
                return {
                    id: shortName,
                    name: model.displayName || shortName,
                    context: model.inputTokenLimit || 4096
                };
            });
        
        console.log(`Найдено ${filteredModels.length} моделей Google Gemini`);
        return filteredModels;
        
    } catch (error) {
        console.error('Ошибка получения моделей от Google:', error.message);
        return [];
    }
}

const providers = {
    // 1. OPENAI
    openai: {
        name: 'OpenAI',
        defaultModel: 'gpt-4o',
        getClient: () => new OpenAI({ apiKey: process.env.OPENAI_API_KEY }),
        
        async fetchModels() {
            const all = await fetchOpenAIModels(process.env.OPENAI_API_KEY);
            return filterLLMModels(all, 'openai');
        },

        async chat(systemPrompt, messages, model) {
            const client = this.getClient();
            const response = await client.chat.completions.create({
                model, messages: filterMessages(messages, systemPrompt),
            });
            return response.choices[0].message.content;
        },
        async stream(systemPrompt, messages, model, res) {
            const client = this.getClient();
            const stream = await client.chat.completions.create({
                model, messages: filterMessages(messages, systemPrompt), stream: true,
            });
            for await (const chunk of stream) {
                const content = chunk.choices[0]?.delta?.content || "";
                if (content) res.write(content);
            }
        }
    },

    // 2. DEEPSEEK
    deepseek: {
        name: 'DeepSeek',
        defaultModel: 'deepseek-chat',
        getClient: () => new OpenAI({ apiKey: process.env.DEEPSEEK_API_KEY, baseURL: 'https://api.deepseek.com' }),
        
        async fetchModels() {
            const all = await fetchOpenAIModels(process.env.DEEPSEEK_API_KEY, 'https://api.deepseek.com');
            return filterLLMModels(all, 'deepseek');
        },

        async chat(systemPrompt, messages, model) {
            const client = this.getClient();
            const response = await client.chat.completions.create({
                model, messages: filterMessages(messages, systemPrompt),
            });
            return response.choices[0].message.content;
        },
        async stream(systemPrompt, messages, model, res) {
            const client = this.getClient();
            const stream = await client.chat.completions.create({
                model, messages: filterMessages(messages, systemPrompt), stream: true,
            });
            for await (const chunk of stream) {
                const content = chunk.choices[0]?.delta?.content || "";
                if (content) res.write(content);
            }
        }
    },

    // 3. xAI (GROK)
    grok: {
        name: 'xAI (Grok)',
        defaultModel: 'grok-beta',
        getClient: () => new OpenAI({ apiKey: process.env.XAI_API_KEY, baseURL: 'https://api.x.ai/v1' }),
        
        async fetchModels() {
            const all = await fetchOpenAIModels(process.env.XAI_API_KEY, 'https://api.x.ai/v1');
            return filterLLMModels(all, 'grok');
        },

        async chat(systemPrompt, messages, model) {
            const client = this.getClient();
            const response = await client.chat.completions.create({
                model, messages: filterMessages(messages, systemPrompt),
            });
            return response.choices[0].message.content;
        },
        async stream(systemPrompt, messages, model, res) {
            const client = this.getClient();
            const stream = await client.chat.completions.create({
                model, messages: filterMessages(messages, systemPrompt), stream: true,
            });
            for await (const chunk of stream) {
                const content = chunk.choices[0]?.delta?.content || "";
                if (content) res.write(content);
            }
        }
    },

    // 4. GROQ (FASTEST)
    groq: {
        name: 'Groq',
        defaultModel: 'llama3-8b-8192',
        getClient: () => new OpenAI({ apiKey: process.env.GROQ_API_KEY, baseURL: 'https://api.groq.com/openai/v1' }),
        
        async fetchModels() {
            const all = await fetchOpenAIModels(process.env.GROQ_API_KEY, 'https://api.groq.com/openai/v1');
            return filterLLMModels(all, 'groq');
        },

        async chat(systemPrompt, messages, model) {
            const client = this.getClient();
            const response = await client.chat.completions.create({
                model, messages: filterMessages(messages, systemPrompt),
            });
            return response.choices[0].message.content;
        },
        async stream(systemPrompt, messages, model, res) {
            const client = this.getClient();
            const stream = await client.chat.completions.create({
                model, messages: filterMessages(messages, systemPrompt), stream: true,
            });
            for await (const chunk of stream) {
                const content = chunk.choices[0]?.delta?.content || "";
                if (content) res.write(content);
            }
        }
    },

    // 5. GOOGLE (GEMINI)
    google: {
        name: 'Google Gemini',
        defaultModel: 'gemini-2.5-flash',
        getClient: () => new GoogleGenerativeAI(process.env.GOOGLE_API_KEY),

        async fetchModels() {
            const all = await fetchGoogleModels(process.env.GOOGLE_API_KEY);
            return filterLLMModels(all, 'google');
        },

        async chat(systemPrompt, messages, model) {
            const genAI = this.getClient();
            const aiModel = genAI.getGenerativeModel({ model });
            const chatHistory = messages.filter(m => m.role !== 'system').map(m => ({
                role: m.role === 'user' ? 'user' : 'model',
                parts: [{ text: m.content }]
            }));
            const chat = aiModel.startChat({
                history: [
                    { role: 'user', parts: [{ text: `System: ${systemPrompt}` }] },
                    { role: 'model', parts: [{ text: "Ok" }] },
                    ...chatHistory.slice(0, -1)
                ]
            });
            const result = await chat.sendMessage(messages[messages.length - 1].content);
            return result.response.text();
        },
        async stream(systemPrompt, messages, model, res) {
             const text = await this.chat(systemPrompt, messages, model);
             res.write(text);
        }
    }
};

function filterMessages(messages, systemPrompt) {
    if (messages.length > 0 && messages[0].role === 'system') return messages;
    return [{ role: 'system', content: systemPrompt }, ...messages];
}

module.exports = { AI_PROVIDERS: providers };