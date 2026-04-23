// routes/rooms.js — групповые комнаты (люди + AI)
const express = require('express');
const router = express.Router();
const { authenticateToken } = require('../middleware/auth');
const Rooms = require('../models/rooms');
const RoomAI = require('../services/room-ai-service');
const SocketService = require('../services/socket-service');

// Создать комнату
router.post('/rooms', authenticateToken, async (req, res) => {
    try {
        const { name, description, is_public, ai_enabled, ai_psychotype, ai_model, ai_auto_respond } = req.body;
        if (!name || !name.trim()) return res.status(400).json({ error: 'Room name required' });

        const room = await Rooms.createRoom({
            name: name.trim(),
            description,
            createdBy: req.user.id,
            isPublic: is_public !== false,
            aiEnabled: ai_enabled !== false,
            aiPsychotype: ai_psychotype || 'empath',
            aiModel: ai_model || null,
            aiAutoRespond: !!ai_auto_respond
        });
        res.json(room);
    } catch (err) {
        console.error('Create room:', err);
        res.status(500).json({ error: err.message });
    }
});

// Мои комнаты
router.get('/rooms/my', authenticateToken, async (req, res) => {
    try {
        const rooms = await Rooms.listUserRooms(req.user.id);
        res.json(rooms);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Публичные комнаты
router.get('/rooms/public', authenticateToken, async (req, res) => {
    try {
        const rooms = await Rooms.listPublicRooms(req.user.id);
        res.json(rooms);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Детали комнаты + участники
router.get('/rooms/:id', authenticateToken, async (req, res) => {
    try {
        const room = await Rooms.getRoomById(req.params.id);
        if (!room) return res.status(404).json({ error: 'Room not found' });
        const member = await Rooms.isMember(room.id, req.user.id);
        if (!room.is_public && !member) return res.status(403).json({ error: 'Access denied' });

        const participants = await Rooms.listParticipants(room.id);
        res.json({ room, participants, is_member: member });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Присоединиться
router.post('/rooms/:id/join', authenticateToken, async (req, res) => {
    try {
        const room = await Rooms.getRoomById(req.params.id);
        if (!room || !room.is_active) return res.status(404).json({ error: 'Room not found' });
        if (!room.is_public) {
            // Пока приватные комнаты без инвайтов — никого не пускаем
            return res.status(403).json({ error: 'Private room — invite required' });
        }

        await Rooms.joinRoom(room.id, req.user.id);
        SocketService.notifyRoomEvent(room.id, 'room_user_joined', {
            room_id: room.id,
            user_id: req.user.id,
            username: req.user.username
        });
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Покинуть
router.post('/rooms/:id/leave', authenticateToken, async (req, res) => {
    try {
        await Rooms.leaveRoom(req.params.id, req.user.id);
        SocketService.notifyRoomEvent(req.params.id, 'room_user_left', {
            room_id: Number(req.params.id),
            user_id: req.user.id,
            username: req.user.username
        });
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Обновить настройки (только admin)
router.patch('/rooms/:id', authenticateToken, async (req, res) => {
    try {
        const result = await Rooms.updateRoomSettings(req.params.id, req.user.id, req.body);
        if (result.error) return res.status(403).json({ error: result.error });
        res.json(result.room);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Закрыть комнату (только admin)
router.post('/rooms/:id/close', authenticateToken, async (req, res) => {
    try {
        const result = await Rooms.closeRoom(req.params.id, req.user.id);
        if (result.error) return res.status(403).json({ error: result.error });
        res.json(result);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// История сообщений
router.get('/rooms/:id/messages', authenticateToken, async (req, res) => {
    try {
        const member = await Rooms.isMember(req.params.id, req.user.id);
        if (!member) return res.status(403).json({ error: 'Not a member' });

        const limit = parseInt(req.query.limit) || 50;
        const beforeId = req.query.beforeId ? parseInt(req.query.beforeId) : null;
        const msgs = await Rooms.getRoomMessages(req.params.id, { limit, beforeId });
        res.json(msgs);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Отправить сообщение
router.post('/rooms/:id/message', authenticateToken, async (req, res) => {
    try {
        const roomId = Number(req.params.id);
        const { message, media_url, media_type } = req.body;
        if (!message && !media_url) return res.status(400).json({ error: 'Empty message' });

        const room = await Rooms.getRoomById(roomId);
        if (!room || !room.is_active) return res.status(404).json({ error: 'Room not found or closed' });

        const member = await Rooms.isMember(roomId, req.user.id);
        if (!member) return res.status(403).json({ error: 'Not a member' });

        const saved = await Rooms.addRoomMessage({
            roomId,
            senderId: req.user.id,
            isAi: false,
            text: message || '[attachment]',
            mediaUrl: media_url || null,
            mediaType: media_type || null
        });

        const payload = { ...saved, sender_username: req.user.username };
        SocketService.notifyRoomEvent(roomId, 'room_message', payload);

        // Решаем, нужен ли ответ AI
        if (RoomAI.shouldRespond(room, message || '')) {
            // Ответ в фоне — не блокируем HTTP ответ
            (async () => {
                try {
                    SocketService.notifyRoomEvent(roomId, 'room_ai_typing', { room_id: roomId });

                    let streamBuf = '';
                    const aiMsg = await RoomAI.respondToRoom(roomId, {
                        onChunk: (c) => {
                            streamBuf += c;
                            SocketService.notifyRoomEvent(roomId, 'room_ai_chunk', {
                                room_id: roomId,
                                text: c
                            });
                        }
                    });

                    if (aiMsg) {
                        SocketService.notifyRoomEvent(roomId, 'room_ai_message', {
                            ...aiMsg,
                            sender_username: 'AI'
                        });
                    }
                    SocketService.notifyRoomEvent(roomId, 'room_ai_done', { room_id: roomId });
                } catch (e) {
                    console.error('Room AI background error:', e.message);
                    SocketService.notifyRoomEvent(roomId, 'room_ai_done', { room_id: roomId });
                }
            })();
        }

        res.json({ success: true, message: payload });
    } catch (err) {
        console.error('Send room message:', err);
        res.status(500).json({ error: err.message });
    }
});

module.exports = router;
