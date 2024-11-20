import TelegramBot from 'node-telegram-bot-api';
import dotenv from 'dotenv';
import pkg from 'pg';
import fetch from 'node-fetch';

dotenv.config();

const { Client } = pkg;

// Подключение к PostgreSQL
const client = new Client({
  connectionString: process.env.DATABASE_URL,
  ssl: {
    rejectUnauthorized: false,
  },
});

client.connect()
  .then(() => console.log('Connected to PostgreSQL'))
  .catch(err => console.error('Connection error', err.stack));

// Инициализация Telegram бота с polling
const token = process.env.TELEGRAM_BOT_TOKEN;
const bot = new TelegramBot(token, { polling: true });

// Команда /start
bot.onText(/\/start/, (msg) => {
  const chatId = msg.chat.id;
  const firstName = msg.from.first_name || 'друг';
  bot.sendMessage(chatId, `Привет, ${firstName}! Я помогу тебе с миграцией токенов. Чем могу помочь?`);
});

// Команда /migrate $token
bot.onText(/\/migrate (.+)/, async (msg, match) => {
  const chatId = msg.chat.id;
  const mintId = match[1].trim(); // Получаем mint_id из команды

  if (!mintId) {
    bot.sendMessage(chatId, `Ошибка: mint_id обязателен.`);
    return;
  }
  try {
    // Добавляем mint_id в базу данных
    const result = await client.query(
      'INSERT INTO tokens (mint_id) VALUES ($1) RETURNING id',
      [mintId]
    );
    const tokenId = result.rows[0].id;

    bot.sendMessage(chatId, `Токен ${mintId} добавлен в базу данных.`);
    console.log(`mint_id ${mintId} добавлен в базу с ID ${tokenId}`);
  } catch (err) {
    console.error('Ошибка добавления токена в базу:', err);
    bot.sendMessage(chatId, `Ошибка: не удалось добавить токен ${mintId}.`);
  }
});

// Получение статуса миграции токенов
const getMigrationStatus = async (mintIds) => {
  const url = `https://api-v3.raydium.io/mint/ids?mints=${mintIds.join(',')}`;
  try {
    const response = await fetch(url);
    const data = await response.json();
    return data.data || [];
  } catch (error) {
    console.error('Error fetching migration status from Raydium', error);
    return [];
  }
};

// Постоянная проверка токенов в базе
const checkMigrationStatusContinuously = async () => {
  try {
    const result = await client.query('SELECT symbol, mint_id FROM tokens');

    for (const row of result.rows) {
      console.log(`Проверяем токен ${row.symbol} на миграцию...`);
      const migrationStatus = await getMigrationStatus([row.mint_id]);

      if (migrationStatus.length > 0) {
        console.log(`Токен ${row.symbol} мигрирован!`);

        // Отправляем сообщение администратору
        bot.sendMessage(process.env.TELEGRAM_ADMIN_CHAT_ID, `Токен ${row.symbol} был мигрирован!`);

        // Удаляем токен из базы данных
        await client.query('DELETE FROM tokens WHERE symbol = $1', [row.symbol]);
        console.log(`Токен ${row.symbol} удален из базы.`);
      }
    }
  } catch (error) {
    console.error('Ошибка в проверке миграции токенов:', error);
  }

  // Повторяем проверку каждые 5 секунд
  setTimeout(checkMigrationStatusContinuously, 5000);
};

// Запуск проверки
checkMigrationStatusContinuously();
