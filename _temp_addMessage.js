// Добавить сообщение в сессию
async function addMessage(conversationId, senderId, messageText, mediaUrl = null, mediaType = null) {
    try {
        const result = await pool.query(
            'INSERT INTO conversation_messages (conversation_id, sender_id, message_text, media_url, media_type) VALUES ($1, $2, $3, $4, $5) RETURNING *',
            [conversationId, senderId, messageText, mediaUrl, mediaType]
        );

        return result.rows[0];
    } catch (error) {
        console.error('Ошибка добавления сообщения:', error);
        return null;
    }
}
