const express = require('express');
const router = express.Router();
const { authenticateToken } = require('../middleware/auth');
// Предполагается, что функции в models/users принимают (req, res), то есть работают как контроллеры
const { registerUser, loginUser, getUserProfile, getUsers } = require('../models/users');

// 📝 Регистрация и Вход
router.post('/register', registerUser);
router.post('/login', loginUser);

// 👤 Профиль
router.get('/profile', authenticateToken, getUserProfile);

// 👥 Список пользователей (Админка)
router.get('/users', authenticateToken, getUsers);

module.exports = router;
