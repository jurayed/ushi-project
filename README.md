# Ushi Project

AI & human chat service. Полностью локальный AI-стек на домашнем GPU (RTX 5090):
- **LLM** — Ollama (gemma3:27b по-умолчанию, RU/UZ/EN)
- **STT** — faster-whisper-server (large-v3, ~99 языков)
- **TTS** — Piper (русский + турецкий как фонетический прокси для узбекского)

## Возможности

1. **Чат 1-на-1 с AI** — текст + голос, стрим ответов, психотипы (эмпат/рационалист/оптимист), кастомный системный промпт, история
2. **Live-слушатели (1-на-1 человек ↔ человек)** — регистрация как слушатель, выбор из списка, текст/голос/видеозвонок (WebRTC)
3. **Групповые комнаты (N людей + AI)** — публичные/приватные, AI-участник отвечает по `@ai` / `/ai` или в авто-режиме

## Стек

- Node.js 18+ / Express / Socket.io
- PostgreSQL — основное хранилище
- Redis — онлайн-статусы (опционально, есть fallback)
- JWT auth + bcrypt

---

## Установка (завтра утром, по шагам)

### 1. Postgres

Если нет — поставь локально. На Windows проще всего:
- `winget install PostgreSQL.PostgreSQL` ИЛИ https://www.postgresql.org/download/windows/

Создай БД:
```bash
psql -U postgres -c "CREATE DATABASE ushi;"
```

Схему **НЕ** применяй вручную — `initializeDatabase()` в `models/database.js` сам создаст все таблицы при старте.

### 2. Redis (опционально)

Проще всего через Docker:
```bash
docker run -d --name redis -p 6379:6379 redis:7-alpine
```

Или пропусти — приложение упадёт на in-memory fallback (онлайн-статусы не переживут рестарт).

### 3. Ollama + модель

```bash
# Установка (одной командой)
curl -fsSL https://ollama.com/install.sh | sh    # Linux/WSL
# или https://ollama.com/download для Windows native

# Скачать модель (gemma3:27b весит ~17 GB, займёт время)
ollama pull gemma3:27b

# (Альтернативы — отредактируй OLLAMA_DEFAULT_MODEL в .env после установки)
ollama pull gemma3:12b         # если 27b тяжело
ollama pull qwen2.5:32b        # для более сильного reasoning (без узбекского officially)

# Проверь
ollama list
ollama run gemma3:27b "Привет! Qanday yordam bera olaman?"
```

Ollama слушает `http://127.0.0.1:11434`.

### 4. faster-whisper-server (STT)

Проще всего через Docker с поддержкой CUDA:

```bash
# Linux/WSL с NVIDIA
docker run -d --gpus all -p 8000:8000 \
  -e WHISPER__MODEL=Systran/faster-whisper-large-v3 \
  --name whisper \
  fedirz/faster-whisper-server:latest-cuda

# Или CPU-only (медленнее, но работает)
docker run -d -p 8000:8000 \
  -e WHISPER__MODEL=Systran/faster-whisper-large-v3 \
  --name whisper \
  fedirz/faster-whisper-server:latest-cpu
```

Проверь:
```bash
curl -F "file=@sample.wav" -F "model=Systran/faster-whisper-large-v3" \
  http://127.0.0.1:8000/v1/audio/transcriptions
```

### 5. Piper TTS (голос)

Piper сам по себе — CLI. Нам нужен HTTP-сервер. Проще всего через Docker:

```bash
docker run -d -p 5000:5000 \
  -v $HOME/piper-voices:/voices \
  -e PIPER_VOICES_DIR=/voices \
  --name piper \
  rhasspy/wyoming-piper \
  --voice ru_RU-irina-medium
```

> Если нужен **не-Wyoming**, а чистый REST — собери из https://github.com/rhasspy/piper или используй `piper-http` (npm-пакет). В `services/tts-service.js` ждём endpoint `POST /api/tts {text, voice} → audio/wav`. При необходимости переключи `TTS_ENGINE=openai-compatible` и натрави на XTTS-v2 API.

Скачай голоса (если Docker не качает сам):
- https://huggingface.co/rhasspy/piper-voices/tree/main/ru/ru_RU
- https://huggingface.co/rhasspy/piper-voices/tree/main/tr/tr_TR
- https://huggingface.co/rhasspy/piper-voices/tree/main/en/en_US

**Узбекский** — если найдёшь/собёрешь локальный TTS лучше турецкого, замени `TTS_VOICE_UZ` в `.env` на нужный.

### 6. Node-приложение

```bash
cp .env.example .env
# отредактируй .env — пропиши пароль от Postgres, JWT_SECRET, проверь URL'ы

npm install
npm run dev        # nodemon, hot reload
# или
npm start
```

Открой http://localhost:3000

---

## Деплой (позже): VPS + домашний PC

Схема:
- **VPS** (дешёвый, 1 vCPU / 1 GB): Node-приложение + Postgres + Redis (или вынести их тоже)
- **Домашний PC** (RTX 5090): Ollama + Whisper + Piper

**Мост** — **Tailscale** (проще всего):

```bash
# Установи на оба хоста
# https://tailscale.com/download
tailscale up
tailscale status   # посмотри 100.x.x.x IP каждого
```

В `.env` на VPS укажи Tailscale-IP домашнего PC:
```
OLLAMA_URL=http://100.x.x.x:11434
WHISPER_URL=http://100.x.x.x:8000
TTS_URL=http://100.x.x.x:5000
```

Ollama по-умолчанию слушает только `127.0.0.1`. Чтобы принимал через Tailscale:
```bash
# В systemd override или env:
OLLAMA_HOST=0.0.0.0:11434 ollama serve
```

Аналогично для Whisper (`--host 0.0.0.0`) и Piper (см. docs).

---

## Переменные окружения

Все описаны в `.env.example` с комментариями. Критичные:

| Переменная | Что | Пример |
|---|---|---|
| `JWT_SECRET` | Секрет для токенов | `openssl rand -hex 32` |
| `DB_*` | Postgres | `ushi / postgres / ***` |
| `OLLAMA_URL` | Ollama endpoint | `http://127.0.0.1:11434` |
| `OLLAMA_DEFAULT_MODEL` | LLM модель | `gemma3:27b` |
| `WHISPER_URL` | STT endpoint | `http://127.0.0.1:8000` |
| `TTS_URL` | TTS endpoint | `http://127.0.0.1:5000` |

---

## Структура

```
routes/           HTTP endpoints
  auth.js          login / register / profile
  providers.js     список AI провайдеров/моделей
  ai-chat.js       1-на-1 с AI (текст + стрим)
  live-ears.js     1-на-1 человек ↔ человек
  rooms.js         групповые комнаты
  tts.js           синтез речи
  upload.js        загрузка + транскрибация аудио

services/
  ai-providers.js       Ollama HTTP-клиент (chat, stream, fetchModels)
  ai-chat-service.js    логика 1-на-1 AI чата
  ai-stream.js          WebSocket live voice session (STT → LLM → TTS)
  transcription-service.js   faster-whisper HTTP клиент
  tts-service.js        Piper/XTTS HTTP клиент + детект языка
  model-sync.js         синхронизация /api/tags → БД при старте
  room-ai-service.js    логика AI-участника в группах
  socket-service.js     сокет-менеджер, Redis, комнаты
  redis.js              Redis обёртка с in-memory fallback

models/
  database.js      Postgres pool + init схемы
  users.js         регистрация/логин/профиль
  conversations.js 1-на-1 сессии + сообщения
  rooms.js         группы + участники + сообщения

middleware/auth.js JWT verify

public/
  index.html, css/, js/   SPA-фронтенд
```

---

## Быстрые проверки

```bash
# БД жива?
psql -U postgres -d ushi -c '\dt'

# Ollama?
curl http://127.0.0.1:11434/api/tags

# Whisper?
curl http://127.0.0.1:8000/v1/audio/transcriptions -X OPTIONS

# Piper?
curl http://127.0.0.1:5000/api/tts -X POST -H "Content-Type: application/json" \
  -d '{"text":"Привет","voice":"ru_RU-irina-medium"}' -o test.wav
```

## Известные нюансы

- **Узбекский TTS**: локально нет — используем турецкий голос как приближение. Если критично — можно подключить Microsoft Edge TTS через отдельный прокси-сервис (есть `TTS_ENGINE=openai-compatible`).
- **node_modules в репо**: раньше был закоммичен. Теперь добавлен в `.gitignore`. Если клонируешь на новую машину — `npm install` заново.
- **Видеозвонки (WebRTC)**: STUN-серверы Google/Twilio, через Internet. На локальной сети может не работать без TURN.
- **Redis опционален**: без него онлайн-статусы хранятся в памяти процесса (рестарт = сброс). Для прода обязательно ставить.
