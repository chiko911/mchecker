import pkg from 'pg'; // Импорт всего пакета
const { Client } = pkg; // Извлекаем Client из всего пакета
import TelegramBot from 'node-telegram-bot-api'; // Для работы с Telegram ботом
import express from 'express'; // Для создания HTTP-сервера
import dotenv from 'dotenv'; // Для работы с переменными окружения
import fetch from 'node-fetch'; // Для выполнения HTTP-запросов

dotenv.config(); // Загружаем переменные из .env

// Настройка подключения к PostgreSQL
const dbClient = new Client({
  connectionString: process.env.DATABASE_URL, // Используем переменные окружения для подключения
  ssl: {
    rejectUnauthorized: false, // Не проверяем сертификат SSL для PostgreSQL на Render
  },
});
dbClient.connect()
  .then(() => console.log('Connected to PostgreSQL'))
  .catch((err) => console.error('Connection error', err.stack));

// Создаем Telegram бота
const bot = new TelegramBot(process.env.TELEGRAM_BOT_TOKEN, { polling: true });

// Получаем порт из переменной окружения, предоставленной Render, или используем 3000 для локальной разработки
const port = process.env.PORT || 3000;

// Пример обработки команды бота
bot.onText(/\/start/, (msg) => {
  const chatId = msg.chat.id;
  bot.sendMessage(chatId, 'Привет! Я помогу тебе с миграцией токенов.');
});

// Пример использования API для получения токенов
app.get('/tokens', async (req, res) => {
  try {
    const response = await fetch('https://api.raydium.io/tokens'); // Ваш запрос к API
    const data = await response.json();
    res.json(data); // Возвращаем ответ с данными
  } catch (error) {
    res.status(500).send('Ошибка при получении данных');
  }
});

// Создание Express сервера
const app = express();

// Стартуем сервер и слушаем на порту
app.listen(port, () => {
  console.log(`Server is running on port ${port}`);
});
