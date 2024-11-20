import express from 'express'; // Импортируем express
import { Client } from 'pg'; // Импортируем pg для работы с PostgreSQL
import TelegramBot from 'node-telegram-bot-api'; // Импортируем Telegram Bot API
import dotenv from 'dotenv'; // Для работы с переменными окружения

dotenv.config(); // Загружаем переменные из .env файла

const app = express(); // Инициализируем Express приложение
const port = process.env.PORT || 3000; // Устанавливаем порт, либо по умолчанию 3000

// Подключение к PostgreSQL
const client = new Client({
  connectionString: process.env.DATABASE_URL, // Строка подключения из переменных окружения
  ssl: {
    rejectUnauthorized: false, // Для работы с SSL
  },
});

client.connect()
  .then(() => {
    console.log('Connected to PostgreSQL');
  })
  .catch(err => {
    console.error('Connection error', err.stack);
  });

// Инициализация Telegram бота
const token = process.env.TELEGRAM_BOT_TOKEN; // Токен из переменных окружения
const bot = new TelegramBot(token, { polling: true });

// Обработка команды /start
bot.onText(/\/start/, (msg) => {
  const chatId = msg.chat.id;
  const firstName = msg.from.first_name;
  const greetingMessage = `Привет, ${firstName}! Я помогу тебе с миграцией токенов. Чем могу помочь?`;

  bot.sendMessage(chatId, greetingMessage);
});

// Маршрут для получения списка токенов
app.get('/tokens', async (req, res) => {
  try {
    const result = await client.query('SELECT * FROM tokens'); // Получаем данные из базы данных
    res.json(result.rows); // Отправляем данные в виде JSON
  } catch (err) {
    console.error('Error fetching tokens', err);
    res.status(500).send('Error fetching tokens');
  }
});

// Запуск сервера
app.listen(port, () => {
  console.log(`Server is running on port ${port}`);
});
