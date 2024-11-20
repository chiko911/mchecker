require('dotenv').config();
const axios = require('axios');
const { Telegraf } = require('telegraf');
const sqlite3 = require('sqlite3').verbose();

// Инициализация базы данных SQLite
const db = new sqlite3.Database('./tokens.db', (err) => {
  if (err) {
    console.error("Error opening database", err);
  } else {
    console.log("Connected to SQLite database.");
  }
});

// Создание таблицы для хранения информации о токенах
db.run('CREATE TABLE IF NOT EXISTS token_migrations (token TEXT PRIMARY KEY, migrated BOOLEAN)', (err) => {
  if (err) {
    console.error("Error creating table", err);
  }
});

// Инициализация Telegram бота
const bot = new Telegraf(process.env.TELEGRAM_BOT_TOKEN);

// Интервал проверки токенов (в миллисекундах)
const CHECK_INTERVAL = 60 * 1000; // 1 минута

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

// Функция проверки токенов
async function checkTokens(tokens) {
  for (const token of tokens) {
    // Проверяем, мигрировал ли токен ранее
    db.get('SELECT migrated FROM token_migrations WHERE token = ?', [token], async (err, row) => {
      if (err) {
        console.error('Error checking token migration in database:', err);
        return;
      }

      if (row && row.migrated) {
        console.log(`Token ${token} has already migrated, skipping.`);
        return;
      }

      console.log(`Checking token: ${token}`);
      const isMigrated = await checkTokenMigration(token);

      if (isMigrated) {
        // Уведомляем и помечаем токен как мигрированный
        await notifyMigration(token);

        // Записываем миграцию в базу данных
        db.run('INSERT OR REPLACE INTO token_migrations (token, migrated) VALUES (?, ?)', [token, true], (err) => {
          if (err) {
            console.error('Error saving migration state to database:', err);
          }
        });
      }
    });
  }
}

// Запуск регулярной проверки
setInterval(() => {
  // Получаем список токенов через API
  axios.get('/api/tokens') // Замените на ваш endpoint
    .then(response => {
      const tokens = response.data.tokens; // Предположим, что токены приходят в поле "tokens"
      checkTokens(tokens);
    })
    .catch(error => {
      console.error('Error fetching tokens:', error.message);
    });
}, CHECK_INTERVAL);

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
