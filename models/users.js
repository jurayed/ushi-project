const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const { pool } = require('./database');

// Регистрация
async function registerUser(req, res) {
  try {
    const { username, email, password } = req.body;
    
    if (!username || !email || !password) {
      return res.status(400).json({ error: 'Заполните все поля' });
    }

    // Хешируем пароль
    const passwordHash = await bcrypt.hash(password, 10);

    const result = await pool.query(
      'INSERT INTO users (username, email, password_hash) VALUES ($1, $2, $3) RETURNING id, username, email, created_at',
      [username, email, passwordHash]
    );

    res.status(201).json({
      message: 'Регистрация успешна',
      user: result.rows[0]
    });
  } catch (error) {
    if (error.code === '23505') { // Код ошибки Postgres "Duplicate key"
      return res.status(400).json({ error: 'Такой пользователь или email уже существует' });
    }
    console.error('Register Error:', error);
    res.status(500).json({ error: 'Ошибка сервера' });
  }
}

// Вход
async function loginUser(req, res) {
  try {
    const { username, password } = req.body;
    
    if (!username || !password) return res.status(400).json({ error: 'Введите логин и пароль' });

    const result = await pool.query('SELECT * FROM users WHERE username = $1', [username]);

    if (result.rows.length === 0) {
      return res.status(401).json({ error: 'Неверный логин или пароль' });
    }

    const user = result.rows[0];
    const passwordMatch = await bcrypt.compare(password, user.password_hash);

    if (!passwordMatch) {
      return res.status(401).json({ error: 'Неверный логин или пароль' });
    }

    // Токен
    const token = jwt.sign(
      { id: user.id, username: user.username }, 
      process.env.JWT_SECRET,
      { expiresIn: '7d' } // Увеличил время жизни токена для удобства
    );

    res.json({
      message: 'Вход выполнен',
      token,
      user: { id: user.id, username: user.username, email: user.email }
    });
  } catch (error) {
    console.error('Login Error:', error);
    res.status(500).json({ error: 'Ошибка сервера' });
  }
}

// Профиль
async function getUserProfile(req, res) {
  try {
    const result = await pool.query(
      'SELECT id, username, email, created_at FROM users WHERE id = $1',
      [req.user.id]
    );
    if (result.rows.length === 0) return res.status(404).json({ error: 'Пользователь не найден' });
    res.json(result.rows[0]);
  } catch (error) {
    res.status(500).json({ error: 'Ошибка сервера' });
  }
}

// Список (для админки)
async function getUsers(req, res) {
  try {
    const result = await pool.query('SELECT id, username, email, created_at FROM users ORDER BY created_at DESC LIMIT 100');
    res.json(result.rows);
  } catch (error) {
    res.status(500).json({ error: 'Ошибка сервера' });
  }
}

module.exports = { registerUser, loginUser, getUserProfile, getUsers };
