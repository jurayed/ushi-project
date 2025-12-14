// services/ai-providers.js
// В Node.js 18+ fetch встроен, импорт не нужен

const AI_PROVIDERS = {
  deepseek: {
    name: 'DeepSeek',
    enabled: !!process.env.DEEPSEEK_API_KEY,
    models: {
      'deepseek-chat': { name: 'DeepSeek Chat (V3)', context: 32000, price: 'Дешево' },
      'deepseek-coder': { name: 'DeepSeek Coder', context: 16000, price: 'Кодинг' }
    },
    defaultModel: 'deepseek-chat',
    chat: callDeepSeek,
    stream: streamDeepSeek
  },
  openai: {
    name: 'OpenAI',
    enabled: !!process.env.OPENAI_API_KEY,
    models: {
      'gpt-4o': { name: 'GPT-4o (Omni)', context: 128000, price: 'Самая умная' },
      'gpt-4-turbo-preview': { name: 'GPT-4 Turbo', context: 128000, price: 'Быстрая' },
      'gpt-4': { name: 'GPT-4 (Classic)', context: 8192, price: 'Дорогая' },
      'gpt-3.5-turbo': { name: 'GPT-3.5 Turbo', context: 16000, price: 'Быстрая/Дешевая' },
      'gpt-3.5-turbo-16k': { name: 'GPT-3.5 Turbo 16k', context: 16000, price: 'Большой контекст' }
    },
    defaultModel: 'gpt-4o',
    chat: callOpenAI,
    stream: streamOpenAI
  },
  gemini: {
    name: 'Google Gemini',
    enabled: !!process.env.GOOGLE_API_KEY,
    models: {
      'gemini-1.5-pro': { name: 'Gemini 1.5 Pro', context: 1000000, price: 'Мощная' },
      'gemini-1.5-flash': { name: 'Gemini 1.5 Flash', context: 1000000, price: 'Быстрая' },
      'gemini-1.0-pro': { name: 'Gemini 1.0 Pro', context: 32000, price: 'Стабильная' },
      'gemini-2.0-flash': { name: 'Gemini 2.0 Flash (Exp)', context: 1000000, price: 'Экспериментальная' }
    },
    defaultModel: 'gemini-1.5-flash',
    chat: callGemini,
    stream: streamGemini
  }
};

// ==================== DEEPSEEK ====================
async function callDeepSeek(systemPrompt, messages, model) {
  const response = await fetch('https://api.deepseek.com/v1/chat/completions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${process.env.DEEPSEEK_API_KEY}` },
    body: JSON.stringify({
      model: model,
      messages: [{ role: 'system', content: systemPrompt }, ...messages],
      temperature: 0.7
    })
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error?.message || 'DeepSeek API Error');
  return data.choices[0].message.content;
}

async function streamDeepSeek(systemPrompt, messages, model, res) {
  const response = await fetch('https://api.deepseek.com/v1/chat/completions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${process.env.DEEPSEEK_API_KEY}` },
    body: JSON.stringify({
      model: model,
      messages: [{ role: 'system', content: systemPrompt }, ...messages],
      stream: true
    })
  });
  await pipeSSEStream(response, res);
}

// ==================== OPENAI ====================
async function callOpenAI(systemPrompt, messages, model) {
  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${process.env.OPENAI_API_KEY}` },
    body: JSON.stringify({
      model: model,
      messages: [{ role: 'system', content: systemPrompt }, ...messages],
    })
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error?.message || 'OpenAI API Error');
  return data.choices[0].message.content;
}

async function streamOpenAI(systemPrompt, messages, model, res) {
  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${process.env.OPENAI_API_KEY}` },
    body: JSON.stringify({
      model: model,
      messages: [{ role: 'system', content: systemPrompt }, ...messages],
      stream: true
    })
  });
  await pipeSSEStream(response, res);
}

// ==================== GEMINI ====================
async function callGemini(systemPrompt, messages, model) {
  const conversation = messages.map(m => `${m.role === 'user' ? 'User' : 'Model'}: ${m.content}`).join('\n');
  const fullPrompt = `${systemPrompt}\n\nHistory:\n${conversation}\n\nModel response:`;

  const url = `https://generativelanguage.googleapis.com/v1/models/${model}:generateContent?key=${process.env.GOOGLE_API_KEY}`;
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ contents: [{ parts: [{ text: fullPrompt }] }] })
  });
  
  const data = await response.json();
  if (!response.ok) throw new Error(data.error?.message || 'Gemini API Error');
  return data.candidates?.[0]?.content?.parts?.[0]?.text || '';
}

async function streamGemini(systemPrompt, messages, model, res) {
  const text = await callGemini(systemPrompt, messages, model);
  const words = text.split(' ');
  for (const word of words) {
    res.write(word + ' ');
    await new Promise(r => setTimeout(r, 50));
  }
}

// ==================== HELPER: SSE PIPING ====================
async function pipeSSEStream(upstreamResponse, res) {
  if (!upstreamResponse.body) return;
  
  const reader = upstreamResponse.body.getReader();
  const decoder = new TextDecoder();

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      
      const chunk = decoder.decode(value);
      const lines = chunk.split('\n');
      
      for (const line of lines) {
        if (line.startsWith('data: ') && !line.includes('[DONE]')) {
          try {
            const data = JSON.parse(line.slice(6));
            const content = data.choices[0]?.delta?.content;
            if (content) res.write(content);
          } catch (e) { /* ignore parse errors */ }
        }
      }
    }
  } catch (err) {
    console.error('Stream Error:', err);
    res.write(`\n[Error: ${err.message}]`);
  }
}

module.exports = { AI_PROVIDERS };
