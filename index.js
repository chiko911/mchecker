require('dotenv').config();
const axios = require('axios');
const { Telegraf } = require('telegraf');

// Инициализация Telegram бота
const bot = new Telegraf(process.env.TELEGRAM_BOT_TOKEN);

// Список токенов для проверки (может быть JSON-строка в .env или массив)
let tokens = JSON.parse(process.env.TOKEN_LIST || '[]');

// Интервал проверки токенов (в миллисекундах)
const CHECK_INTERVAL = 60 * 1000; // 1 минута

// Хранилище для уже мигрированных токенов
const migratedTokens = new Set();

// Функция проверки миграции токена
async function checkTokenMigration(token) {
  try {
    const response = await axios.get(`https://api-v3.raydium.io/mint/ids?mints=${token}`);
    return response.data.data.length > 0;
  } catch (error) {
    console.error(`Error checking migration for token ${token}:`, error.message);
    return false;
  }
}

// Функция уведомления о миграции
async function notifyMigration(token) {
  try {
    await bot.telegram.sendMessage(
      process.env.TELEGRAM_CHAT_ID, 
      `✅ Токен **${token}** успешно мигрирован!`,
      { parse_mode: 'Markdown' }
    );
    console.log(`Notification sent for token: ${token}`);
  } catch (error) {
    console.error(`Error sending notification for token ${token}:`, error.message);
  }
}

// Функция проверки всех токенов
async function checkTokens() {
  for (const token of tokens) {
    // Пропускаем уже проверенные токены
    if (migratedTokens.has(token)) continue;

    console.log(`Checking token: ${token}`);
    const isMigrated = await checkTokenMigration(token);

    if (isMigrated) {
      // Уведомляем и помечаем токен как мигрированный
      await notifyMigration(token);
      migratedTokens.add(token);
    }
  }
}

// Запуск регулярной проверки
setInterval(checkTokens, CHECK_INTERVAL);

// Запуск Telegram-бота
bot.launch().then(() => {
  console.log('Telegram bot is running...');
});

// Обработчик выхода
process.on('SIGINT', () => {
  bot.stop('SIGINT');
  console.log('Bot stopped');
});
process.on('SIGTERM', () => {
  bot.stop('SIGTERM');
  console.log('Bot stopped');
});
