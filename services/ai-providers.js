// services/ai-providers.js
// Локальный LLM через Ollama (OpenAI-compatible API).
// Все внешние провайдеры (OpenAI/Deepseek/Gemini/xAI/Groq) удалены — используем только локальную модель.

const OLLAMA_URL = process.env.OLLAMA_URL || 'http://127.0.0.1:11434';
const DEFAULT_MODEL = process.env.OLLAMA_DEFAULT_MODEL || 'gemma3:27b';

async function fetchTagsRaw() {
    const res = await fetch(`${OLLAMA_URL}/api/tags`);
    if (!res.ok) throw new Error(`Ollama /api/tags HTTP ${res.status}`);
    const data = await res.json();
    return Array.isArray(data.models) ? data.models : [];
}

async function fetchModels() {
    try {
        const raw = await fetchTagsRaw();
        return raw.map(m => ({
            id: m.name,
            name: m.name,
            context: m.details?.parameter_size ? 8192 : 8192 // Ollama не отдаёт контекст в /api/tags
        }));
    } catch (e) {
        console.error('Ollama fetchModels:', e.message);
        return [];
    }
}

function buildChatBody(model, messages, stream = false) {
    return {
        model,
        messages,
        stream,
        options: {
            temperature: 0.7
        }
    };
}

async function chat(systemPrompt, messages, model) {
    const finalMessages = ensureSystem(messages, systemPrompt);
    const res = await fetch(`${OLLAMA_URL}/api/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(buildChatBody(model || DEFAULT_MODEL, finalMessages, false))
    });
    if (!res.ok) {
        const txt = await res.text();
        throw new Error(`Ollama HTTP ${res.status}: ${txt.slice(0, 200)}`);
    }
    const data = await res.json();
    return data.message?.content || '';
}

async function stream(systemPrompt, messages, model, res) {
    const finalMessages = ensureSystem(messages, systemPrompt);
    const response = await fetch(`${OLLAMA_URL}/api/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(buildChatBody(model || DEFAULT_MODEL, finalMessages, true))
    });
    if (!response.ok) {
        const txt = await response.text();
        throw new Error(`Ollama HTTP ${response.status}: ${txt.slice(0, 200)}`);
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';

    while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });

        let nl;
        while ((nl = buffer.indexOf('\n')) !== -1) {
            const line = buffer.slice(0, nl).trim();
            buffer = buffer.slice(nl + 1);
            if (!line) continue;
            try {
                const j = JSON.parse(line);
                const chunk = j.message?.content;
                if (chunk) res.write(chunk);
                if (j.done) return;
            } catch (_) { /* skip malformed */ }
        }
    }
}

// Обёртка для stream, возвращающая async-iterable чанков (для ai-stream.js)
async function* streamChunks(systemPrompt, messages, model) {
    const finalMessages = ensureSystem(messages, systemPrompt);
    const response = await fetch(`${OLLAMA_URL}/api/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(buildChatBody(model || DEFAULT_MODEL, finalMessages, true))
    });
    if (!response.ok) {
        throw new Error(`Ollama HTTP ${response.status}`);
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';

    while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });

        let nl;
        while ((nl = buffer.indexOf('\n')) !== -1) {
            const line = buffer.slice(0, nl).trim();
            buffer = buffer.slice(nl + 1);
            if (!line) continue;
            try {
                const j = JSON.parse(line);
                const chunk = j.message?.content;
                if (chunk) yield chunk;
                if (j.done) return;
            } catch (_) { }
        }
    }
}

function ensureSystem(messages, systemPrompt) {
    if (messages.length > 0 && messages[0].role === 'system') return messages;
    return [{ role: 'system', content: systemPrompt }, ...messages];
}

const ollama = {
    id: 'ollama',
    name: 'Ollama (Local)',
    defaultModel: DEFAULT_MODEL,
    fetchModels,
    chat,
    stream,
    streamChunks,
};

module.exports = {
    AI_PROVIDERS: { ollama },
    DEFAULT_PROVIDER_ID: 'ollama',
    DEFAULT_MODEL,
    OLLAMA_URL
};
