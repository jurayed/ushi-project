// Ngrok Fix - перехватывает все запросы к localhost:3000
(function() {
    'use strict';
    
    console.log('🔧 Ngrok Fix активирован');
    
    // Сохраняем оригинальный fetch
    const originalFetch = window.fetch;
    
    // Переопределяем fetch
    window.fetch = function(url, options) {
        let modifiedUrl = url;
        
        // Если URL содержит localhost:3000, заменяем на относительный путь
        if (typeof url === 'string' && url.includes('localhost:3000')) {
            modifiedUrl = url.replace(/https?:\/\/localhost:3000/, '');
            console.log('🔄 Ngrok Fix: исправлен URL', url, '→', modifiedUrl);
        }
        
        // Вызываем оригинальный fetch с исправленным URL
        return originalFetch.call(this, modifiedUrl, options);
    };
    
    // Также перехватываем XMLHttpRequest
    const originalOpen = XMLHttpRequest.prototype.open;
    XMLHttpRequest.prototype.open = function(method, url, async, user, password) {
        let modifiedUrl = url;
        
        if (typeof url === 'string' && url.includes('localhost:3000')) {
            modifiedUrl = url.replace(/https?:\/\/localhost:3000/, '');
            console.log('🔄 Ngrok Fix (XMLHttpRequest): исправлен URL', url, '→', modifiedUrl);
        }
        
        return originalOpen.call(this, method, modifiedUrl, async, user, password);
    };
    
    console.log('✅ Ngrok Fix готов к работе!');
})();