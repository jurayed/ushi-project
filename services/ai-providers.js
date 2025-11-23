// AI Providers Configuration
const AI_PROVIDERS = {
  deepseek: {
    name: 'DeepSeek',
    enabled: !!process.env.DEEPSEEK_API_KEY,
    models: {
      'deepseek-chat': { name: 'DeepSeek Chat', context: 32_768, price: '$0.14/1M input' },
      'deepseek-coder': { name: 'DeepSeek Coder', context: 16_384, price: '$0.14/1M input' }
    },
    defaultModel: 'deepseek-chat',
    call: callDeepSeek
  },
  openai: {
    name: 'OpenAI',
    enabled: !!process.env.OPENAI_API_KEY,
    models: {
      'gpt-4-turbo-preview': { name: 'GPT-4 Turbo', context: 128_000, price: '$10/1M input' },
      'gpt-4': { name: 'GPT-4', context: 8_192, price: '$30/1M input' },
      'gpt-3.5-turbo': { name: 'GPT-3.5 Turbo', context: 16_385, price: '$1.5/1M input' }
    },
    defaultModel: 'gpt-4-turbo-preview',
    call: callOpenAI
  },
  gemini: {
    name: 'Google Gemini',
    enabled: !!process.env.GOOGLE_API_KEY,
    models: {
      'gemini-2.0-flash': { 
        name: 'Gemini 2.0 Flash (рекомендуется)', 
        context: 1_000_000, 
        price: 'Бесплатно (быстрая)' 
      },
      'gemini-2.0-flash-001': { 
        name: 'Gemini 2.0 Flash 001', 
        context: 1_000_000, 
        price: 'Бесплатно' 
      },
      'gemini-2.5-flash': { 
        name: 'Gemini 2.5 Flash (новая)', 
        context: 1_000_000, 
        price: 'Бесплатно' 
      },
      'gemini-2.0-flash-lite': { 
        name: 'Gemini 2.0 Flash Lite', 
        context: 1_000_000, 
        price: 'Бесплатно (облегченная)' 
      }
    },
    defaultModel: 'gemini-2.0-flash',
    call: callGemini
  }
};

// DeepSeek API с поддержкой модели
async function callDeepSeek(systemPrompt, userMessage, model = 'deepseek-chat') {
  try {
    const response = await fetch('https://api.deepseek.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${process.env.DEEPSEEK_API_KEY}`
      },
      body: JSON.stringify({
        model: model,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userMessage }
        ],
        max_tokens: 500,
        temperature: 0.7
      })
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`❌ DeepSeek API error ${response.status}:`, errorText);
      throw new Error(`DeepSeek API error: ${response.status}`);
    }

    const data = await response.json();
    return data.choices[0].message.content;
  } catch (error) {
    console.error('❌ DeepSeek API call failed:', error);
    throw error;
  }
}

// OpenAI API с поддержкой модели
async function callOpenAI(systemPrompt, userMessage, model = 'gpt-4-turbo-preview') {
  try {
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`
      },
      body: JSON.stringify({
        model: model,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userMessage }
        ],
        max_tokens: 500,
        temperature: 0.7
      })
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`❌ OpenAI API error ${response.status}:`, errorText);
      throw new Error(`OpenAI API error: ${response.status}`);
    }

    const data = await response.json();
    return data.choices[0].message.content;
  } catch (error) {
    console.error('❌ OpenAI API call failed:', error);
    throw error;
  }
}

// Google Gemini API с поддержкой модели
async function callGemini(systemPrompt, userMessage, model = 'gemini-2.0-flash') {
  try {
    const url = `https://generativelanguage.googleapis.com/v1/models/${model}:generateContent?key=${process.env.GOOGLE_API_KEY}`;
    
    console.log(`🔍 Gemini API Call: ${model}`);
    
    const requestBody = {
      contents: [
        {
          parts: [
            {
              text: `${systemPrompt}\n\nUser: ${userMessage}\n\nAssistant:`
            }
          ]
        }
      ],
      generationConfig: {
        maxOutputTokens: 500,
        temperature: 0.7
      }
    };

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(requestBody)
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`❌ Gemini API error ${response.status}:`, errorText);
      throw new Error(`Gemini API error: ${response.status}`);
    }

    const data = await response.json();
    
    if (data.candidates && data.candidates[0] && data.candidates[0].content && data.candidates[0].content.parts[0]) {
      return data.candidates[0].content.parts[0].text;
    } else {
      throw new Error('Invalid response format from Gemini API');
    }

  } catch (error) {
    console.error('❌ Gemini API call failed:', error);
    throw error;
  }
}

module.exports = {
  AI_PROVIDERS,
  callDeepSeek,
  callOpenAI,
  callGemini
};