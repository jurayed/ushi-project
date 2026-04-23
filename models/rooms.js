// models/rooms.js
// Групповые комнаты: N участников-людей + опциональный AI-участник.

const { pool } = require('./database');

async function createRoom({ name, description, createdBy, isPublic = true, aiEnabled = true, aiPsychotype = 'empath', aiModel = null, aiAutoRespond = false }) {
    const res = await pool.query(
        `INSERT INTO rooms (name, description, created_by, is_public, ai_enabled, ai_psychotype, ai_model, ai_auto_respond)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
         RETURNING *`,
        [name, description || null, createdBy, isPublic, aiEnabled, aiPsychotype, aiModel, aiAutoRespond]
    );
    const room = res.rows[0];
    // Создатель — автоматически участник и admin
    await pool.query(
        `INSERT INTO room_participants (room_id, user_id, role) VALUES ($1, $2, 'admin')
         ON CONFLICT DO NOTHING`,
        [room.id, createdBy]
    );
    return room;
}

async function getRoomById(roomId) {
    const res = await pool.query(`SELECT * FROM rooms WHERE id = $1`, [roomId]);
    return res.rows[0] || null;
}

async function listUserRooms(userId) {
    const res = await pool.query(
        `SELECT r.*, rp.role as my_role, rp.joined_at,
                (SELECT COUNT(*) FROM room_participants WHERE room_id = r.id AND left_at IS NULL) as participant_count
         FROM rooms r
         JOIN room_participants rp ON rp.room_id = r.id
         WHERE rp.user_id = $1 AND rp.left_at IS NULL AND r.is_active = true
         ORDER BY r.created_at DESC`,
        [userId]
    );
    return res.rows;
}

async function listPublicRooms(excludeUserId = null, limit = 100) {
    const res = await pool.query(
        `SELECT r.*,
                (SELECT COUNT(*) FROM room_participants WHERE room_id = r.id AND left_at IS NULL) as participant_count,
                EXISTS (
                    SELECT 1 FROM room_participants
                    WHERE room_id = r.id AND user_id = $1 AND left_at IS NULL
                ) as is_member
         FROM rooms r
         WHERE r.is_public = true AND r.is_active = true
         ORDER BY r.created_at DESC
         LIMIT $2`,
        [excludeUserId, limit]
    );
    return res.rows;
}

async function isMember(roomId, userId) {
    const res = await pool.query(
        `SELECT 1 FROM room_participants
         WHERE room_id = $1 AND user_id = $2 AND left_at IS NULL`,
        [roomId, userId]
    );
    return res.rowCount > 0;
}

async function joinRoom(roomId, userId) {
    const res = await pool.query(
        `INSERT INTO room_participants (room_id, user_id)
         VALUES ($1, $2)
         ON CONFLICT (room_id, user_id) DO UPDATE SET left_at = NULL, joined_at = CURRENT_TIMESTAMP
         RETURNING *`,
        [roomId, userId]
    );
    return res.rows[0];
}

async function leaveRoom(roomId, userId) {
    await pool.query(
        `UPDATE room_participants SET left_at = CURRENT_TIMESTAMP
         WHERE room_id = $1 AND user_id = $2`,
        [roomId, userId]
    );
}

async function listParticipants(roomId) {
    const res = await pool.query(
        `SELECT u.id, u.username, rp.role, rp.joined_at
         FROM room_participants rp
         JOIN users u ON u.id = rp.user_id
         WHERE rp.room_id = $1 AND rp.left_at IS NULL
         ORDER BY rp.joined_at ASC`,
        [roomId]
    );
    return res.rows;
}

async function addRoomMessage({ roomId, senderId, isAi = false, text, mediaUrl = null, mediaType = null }) {
    const res = await pool.query(
        `INSERT INTO room_messages (room_id, sender_id, is_ai, message_text, media_url, media_type)
         VALUES ($1, $2, $3, $4, $5, $6)
         RETURNING *`,
        [roomId, senderId, isAi, text, mediaUrl, mediaType]
    );
    return res.rows[0];
}

async function getRoomMessages(roomId, { limit = 50, beforeId = null } = {}) {
    const params = [roomId, limit];
    let where = `WHERE rm.room_id = $1`;
    if (beforeId) {
        params.push(beforeId);
        where += ` AND rm.id < $${params.length}`;
    }
    const res = await pool.query(
        `SELECT rm.*, u.username as sender_username
         FROM room_messages rm
         LEFT JOIN users u ON u.id = rm.sender_id
         ${where}
         ORDER BY rm.id DESC
         LIMIT $2`,
        params
    );
    return res.rows.reverse();
}

async function updateRoomSettings(roomId, userId, patch) {
    // Только admin может менять настройки
    const check = await pool.query(
        `SELECT role FROM room_participants WHERE room_id = $1 AND user_id = $2 AND left_at IS NULL`,
        [roomId, userId]
    );
    if (check.rows.length === 0 || check.rows[0].role !== 'admin') {
        return { error: 'Only admin can update room settings' };
    }

    const allowed = ['name', 'description', 'is_public', 'ai_enabled', 'ai_psychotype', 'ai_model', 'ai_auto_respond'];
    const sets = [];
    const values = [];
    for (const key of allowed) {
        if (patch[key] !== undefined) {
            values.push(patch[key]);
            sets.push(`${key} = $${values.length}`);
        }
    }
    if (sets.length === 0) return { room: await getRoomById(roomId) };

    values.push(roomId);
    const res = await pool.query(
        `UPDATE rooms SET ${sets.join(', ')} WHERE id = $${values.length} RETURNING *`,
        values
    );
    return { room: res.rows[0] };
}

async function closeRoom(roomId, userId) {
    const check = await pool.query(
        `SELECT role FROM room_participants WHERE room_id = $1 AND user_id = $2 AND left_at IS NULL`,
        [roomId, userId]
    );
    if (check.rows.length === 0 || check.rows[0].role !== 'admin') {
        return { error: 'Only admin can close room' };
    }
    await pool.query(`UPDATE rooms SET is_active = false WHERE id = $1`, [roomId]);
    return { message: 'Room closed' };
}

module.exports = {
    createRoom,
    getRoomById,
    listUserRooms,
    listPublicRooms,
    isMember,
    joinRoom,
    leaveRoom,
    listParticipants,
    addRoomMessage,
    getRoomMessages,
    updateRoomSettings,
    closeRoom
};
