// services/ai-providers.js
const { OpenAI } = require('openai');
const { GoogleGenerativeAI } = require('@google/generative-ai');

// Хелпер для получения списка моделей через OpenAI-compatible API
async function fetchOpenAIModels(apiKey, baseURL) {
    if (!apiKey) return [];
    try {
        const client = new OpenAI({ apiKey, baseURL });
        const list = await client.models.list();
        return list.data.map(m => ({
            id: m.id,
            name: m.id, // Имя совпадает с ID, если API не дает pretty name
            context: 128000 // Дефолт, так как API редко отдает размер контекста
        }));
    } catch (e) {
        console.error(`Ошибка получения моделей с ${baseURL}:`, e.message);
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
            // OpenAI отдает ОЧЕНЬ много моделей (dall-e, tts). Фильтруем.
            const all = await fetchOpenAIModels(process.env.OPENAI_API_KEY);
            return all.filter(m => m.id.includes('gpt'));
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
            return await fetchOpenAIModels(process.env.DEEPSEEK_API_KEY, 'https://api.deepseek.com');
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
            return await fetchOpenAIModels(process.env.XAI_API_KEY, 'https://api.x.ai/v1');
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
            // Groq отдает whisper и другие. Оставляем только LLM.
            const all = await fetchOpenAIModels(process.env.GROQ_API_KEY, 'https://api.groq.com/openai/v1');
            return all.filter(m => !m.id.includes('whisper')); 
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

    // 5. GOOGLE (GEMINI) - Хардкод, т.к. API другое
    google: {
        name: 'Google Gemini',
        defaultModel: 'gemini-pro',
        getClient: () => new GoogleGenerativeAI(process.env.GOOGLE_API_KEY),

        // Для Google пока оставим хардкод, так как их API listModels возвращает много мусора
        async fetchModels() {
            return [
                { id: 'gemini-pro', name: 'Gemini Pro', context: 32000 },
                { id: 'gemini-1.5-flash', name: 'Gemini 1.5 Flash', context: 1000000 },
                { id: 'gemini-1.5-pro', name: 'Gemini 1.5 Pro', context: 2000000 }
            ];
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
             const text = await this.chat(systemPrompt, messages, model); // Пока без стрима для Google
             res.write(text);
        }
    }
};

function filterMessages(messages, systemPrompt) {
    if (messages.length > 0 && messages[0].role === 'system') return messages;
    return [{ role: 'system', content: systemPrompt }, ...messages];
}

module.exports = { AI_PROVIDERS: providers };
