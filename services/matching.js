const { 
  findAvailableEar, 
  createConversation,
  getAvailableEarsCount 
} = require('../models/conversations');

// Найти слушателя для пользователя
async function matchUserWithEar(userId) {
  try {
    // Проверяем доступных слушателей
    const availableCount = await getAvailableEarsCount();
    
    if (availableCount === 0) {
      return { 
        success: false, 
        error: 'В настоящее время нет доступных слушателей. Попробуйте позже.' 
      };
    }

    // Ищем подходящего слушателя
    const ear = await findAvailableEar(userId);
    
    if (!ear) {
      return { 
        success: false, 
        error: 'Не удалось найти подходящего слушателя' 
      };
    }

    // Создаем сессию
    const conversation = await createConversation(userId, ear.id);
    
    if (!conversation) {
      return { 
        success: false, 
        error: 'Ошибка при создании сессии' 
      };
    }

    return {
      success: true,
      conversation: {
        id: conversation.id,
        ear: {
          id: ear.user_id,
          username: ear.username,
          rating: ear.rating,
          sessions_completed: ear.sessions_completed
        }
      }
    };
  } catch (error) {
    console.error('Ошибка матчинга:', error);
    return { 
      success: false, 
      error: 'Внутренняя ошибка сервера при поиске слушателя' 
    };
  }
}

module.exports = {
  matchUserWithEar
};