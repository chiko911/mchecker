import pg from 'pg';  // Импортируем pg как default
const { Client } = pg;  // Извлекаем Client из дефолтного импорта
import fetch from 'node-fetch'; // Для работы с API
import TelegramBot from 'node-telegram-bot-api'; // Для Telegram API

const token = process.env.TELEGRAM_BOT_TOKEN;  // Укажите токен вашего бота
const bot = new TelegramBot(token, { polling: true });

const client = new Client({
  connectionString: process.env.DATABASE_URL,  // Строка подключения из переменных окружения
  ssl: {
    rejectUnauthorized: false, // Отключаем проверку сертификатов (для использования с Render)
  },
});

// Слушаем сообщения от пользователей и добавляем токены в базу
bot.onText(/\/addtoken (.+)/, async (msg, match) => {
  const chatId = msg.chat.id;
  const token = match[1];

  try {
    // Добавляем токен в базу данных
    await client.query('INSERT INTO tokens (token, chat_id) VALUES ($1, $2)', [token, chatId]);
    bot.sendMessage(chatId, `Токен ${token} добавлен для отслеживания.`);
  } catch (err) {
    console.error('Ошибка добавления токена:', err);
    bot.sendMessage(chatId, 'Произошла ошибка при добавлении токена.');
  }
});

// Функция для проверки миграции токенов
async function checkTokenMigration(token) {
  const url = `https://api-v3.raydium.io/mint/ids?mints=${token}`;
  try {
    const response = await fetch(url);
    const data = await response.json();

    // Проверка, прошла ли миграция
    if (data.success && data.data.length > 0) {
      return true;
    }
    return false;
  } catch (err) {
    console.error('Ошибка при проверке миграции:', err);
    return false;
  }
}

// Функция для отправки уведомления в Telegram
async function notifyMigrationSuccess(token, chatId) {
  const message = `Токен ${token} успешно мигрировал!`;
  await bot.sendMessage(chatId, message);
}

// Проверка токенов, добавленных в базу данных
async function checkAllTokens() {
  const res = await client.query('SELECT * FROM tokens');
  for (const row of res.rows) {
    const { token, chat_id } = row;
    const migrated = await checkTokenMigration(token);
    
    if (migrated) {
      await notifyMigrationSuccess(token, chat_id);
      // Удаляем токен из базы после успешной миграции
      await client.query('DELETE FROM tokens WHERE token = $1', [token]);
    }
  }
}

// Запуск проверки токенов каждую минуту
setInterval(checkAllTokens, 5000); // Проверяем каждые 60 секунд
