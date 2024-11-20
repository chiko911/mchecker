const express = require('express');
const MongoClient = require('mongodb').MongoClient;
const axios = require('axios');
const TelegramBot = require('node-telegram-bot-api');
require('dotenv').config();

const app = express();
app.use(express.json());

// Создание экземпляра Telegram-бота
const bot = new TelegramBot(process.env.TELEGRAM_BOT_TOKEN, { polling: true });
const chatId = process.env.TELEGRAM_CHAT_ID;

// Подключение к базе данных
const client = new MongoClient(process.env.MONGO_URI, { useNewUrlParser: true, useUnifiedTopology: true });
let db;

client.connect()
  .then(() => {
    db = client.db('migration_db');
    console.log('Database connected');
  })
  .catch(err => console.error(err));

// Функция для проверки миграции токена
async function checkTokenMigration(token) {
  try {
    const response = await axios.get(`https://api-v3.raydium.io/mint/ids?mints=${token}`);
    const data = response.data;

    if (data.success && data.data && data.data[0] !== null) {
      // Если миграция прошла успешно, отправляем сообщение в Telegram
      await bot.sendMessage(chatId, `Токен ${token} успешно мигрировал!`);
      // Удаляем токен из базы данных
      const collection = db.collection('tokens');
      await collection.deleteOne({ token });
      console.log(`Токен ${token} мигрировал и был удален из базы`);
    }
  } catch (error) {
    console.error(`Ошибка при проверке миграции токена ${token}: `, error);
  }
}

// Обработчик команды от пользователя
bot.onText(/\/addtoken (\w+)/, async (msg, match) => {
  const chatId = msg.chat.id;
  const token = match[1];  // Получаем токен из сообщения

  if (!token) {
    return bot.sendMessage(chatId, 'Пожалуйста, укажите токен');
  }

  // Добавляем токен в базу данных
  const collection = db.collection('tokens');
  const exists = await collection.findOne({ token });

  if (!exists) {
    await collection.insertOne({ token });
    console.log(`Токен ${token} добавлен в базу`);
    // Сразу проверяем миграцию токена
    await checkTokenMigration(token);
    bot.sendMessage(chatId, `Токен ${token} добавлен для проверки миграции`);
  } else {
    bot.sendMessage(chatId, `Токен ${token} уже существует в базе`);
  }
});

// Запуск приложения
app.listen(3000, () => {
  console.log('Server running on port 3000');
});
