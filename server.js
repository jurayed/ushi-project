require('dotenv').config();
const express = require('express');
const { Pool } = require('pg');
const bcrypt = require('bcrypt');
const cors = require('cors');

const app = express();
const port = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());

// База данных
const pool = new Pool({
  host: process.env.DB_HOST,
  port: process.env.DB_PORT,
  database: process.env.DB_NAME,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
});

// Единый формат ответа API
const apiResponse = (success, data, message = '') => ({
  success,
  data,
  message
});

// Ваши существующие endpoints (здоровье, регистрация, логин)
// ... ваш текущий код ...

app.listen(port, () => {
  console.log(`🚀 Сервер запущен на http://localhost:${port}`);
});
