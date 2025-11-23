const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const { pool } = require('./database');

// Регистрация пользователя
async function registerUser(req, res) {
  try {
    console.log('🔑 Попытка регистрации:', req.body);
    
    const { username, email, password } = req.body;
    
    if (!username || !email || !password) {
      return res.status(400).json({ error: 'Все поля обязательны' });
    }

    const saltRounds = 10;
    const passwordHash = await bcrypt.hash(password, saltRounds);

    const result = await pool.query(
      'INSERT INTO users (username, email, password_hash) VALUES ($1, $2, $3) RETURNING id, username, email, created_at',
      [username, email, passwordHash]
    );

    console.log('✅ Пользователь зарегистрирован:', username);

    res.status(201).json({
      message: 'Пользователь успешно зарегистрирован',
      user: result.rows[0]
    });
  } catch (error) {
    console.error('❌ Ошибка регистрации:', error);
    if (error.code === '23505') {
      res.status(400).json({ error: 'Пользователь с таким именем или email уже существует' });
    } else {
      res.status(500).json({ error: 'Внутренняя ошибка сервера' });
    }
  }
}

// Вход пользователя
async function loginUser(req, res) {
  try {
    console.log('🔑 Попытка входа:', req.body);
    
    const { username, password } = req.body;

    if (!username || !password) {
      console.log('❌ Не все поля заполнены');
      return res.status(400).json({ error: 'Все поля обязательны' });
    }

    console.log('🔍 Ищем пользователя:', username);
    const result = await pool.query(
      'SELECT * FROM users WHERE username = $1',
      [username]
    );

    if (result.rows.length === 0) {
      console.log('❌ Пользователь не найден:', username);
      return res.status(401).json({ error: 'Неверное имя пользователя или пароль' });
    }

    const user = result.rows[0];
    console.log('✅ Пользователь найден:', user.username);

    const passwordMatch = await bcrypt.compare(password, user.password_hash);
    
    if (!passwordMatch) {
      console.log('❌ Неверный пароль для пользователя:', username);
      return res.status(401).json({ error: 'Неверное имя пользователя или пароль' });
    }

    // Создаем JWT токен
    const token = jwt.sign(
      { 
        id: user.id, 
        username: user.username 
      }, 
      process.env.JWT_SECRET,
      { expiresIn: '24h' }
    );

    console.log('✅ Вход выполнен успешно, токен выдан для:', username);

    res.json({
      message: 'Вход выполнен успешно',
      token: token,
      user: {
        id: user.id,
        username: user.username,
        email: user.email,
        created_at: user.created_at
      }
    });
  } catch (error) {
    console.error('❌ Ошибка входа:', error);
    console.error('🔧 Детали ошибки:', error.message);
    res.status(500).json({ 
      error: 'Внутренняя ошибка сервера',
      details: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
}

// Получить профиль пользователя
async function getUserProfile(req, res) {
  try {
    const result = await pool.query(
      'SELECT id, username, email, created_at FROM users WHERE id = $1',
      [req.user.id]
    );
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Пользователь не найден' });
    }
    
    res.json(result.rows[0]);
  } catch (error) {
    console.error('Ошибка получения профиля:', error);
    res.status(500).json({ error: 'Внутренняя ошибка сервера' });
  }
}

// Получить список пользователей (для админов)
async function getUsers(req, res) {
  try {
    const result = await pool.query(
      'SELECT id, username, email, created_at FROM users ORDER BY created_at DESC'
    );
    res.json(result.rows);
  } catch (error) {
    console.error('Ошибка получения пользователей:', error);
    res.status(500).json({ error: 'Внутренняя ошибка сервера' });
  }
}

module.exports = {
  registerUser,
  loginUser,
  getUserProfile,
  getUsers
};