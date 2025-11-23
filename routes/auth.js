const express = require('express');
const router = express.Router();
const { authenticateToken } = require('../middleware/auth');
const { registerUser, loginUser, getUserProfile, getUsers } = require('../models/users');

// Health check endpoint
router.get('/health', (req, res) => {
  res.json({ 
    status: 'OK', 
    timestamp: new Date().toISOString(),
    uptime: process.uptime()
  });
});

// Регистрация пользователя
router.post('/register', registerUser);

// Вход пользователя
router.post('/login', loginUser);

// Получить профиль пользователя
router.get('/profile', authenticateToken, getUserProfile);

// Получить список пользователей (для админов)
router.get('/users', authenticateToken, getUsers);

module.exports = router;