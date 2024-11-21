import TelegramBot from 'node-telegram-bot-api';
import express from 'express';
import bodyParser from 'body-parser';
import dotenv from 'dotenv';
import pkg from 'pg';
import fetch from 'node-fetch';

dotenv.config();

const { Client } = pkg;

// Инициализация базы данных PostgreSQL
const client = new Client({
  connectionString: process.env.DATABASE_URL,
  ssl: {
    rejectUnauthorized: false,
  },
});

client.connect()
  .then(() => console.log('Connected to PostgreSQL'))
  .catch(err => console.error('Connection error', err.stack));

// Инициализация Telegram-бота
const token = process.env.TELEGRAM_BOT_TOKEN;
const bot = new TelegramBot(token);

// Настройка Express-сервера
const app = express();
app.use(bodyParser.json()); // Для парсинга JSON данных от Telegram

// Устанавливаем Webhook для Telegram-бота
const webhookUrl = `${process.env.RENDER_EXTERNAL_URL}/bot${token}`; // Используем внешний URL, предоставленный Render

bot.setWebHook(webhookUrl)
  .then(() => console.log(`Webhook set to ${webhookUrl}`))
  .catch(err => console.error('Error setting webhook:', err));

// Обработчик запросов от Telegram (для webhook)
app.post(`/bot${token}`, (req, res) => {
  bot.processUpdate(req.body); // Обрабатываем обновления от Telegram
  res.sendStatus(200); // Отправляем ответ Telegram, чтобы он знал, что запрос обработан
});

// Маппинг mint_id -> chatId
const userRequests = {};

// Команда /start (уже без кнопок)
bot.onText(/\/start/, (msg) => {
  const chatId = msg.chat.id;
  const firstName = msg.from.first_name || 'друг';

  bot.sendMessage(chatId, `Привет, ${firstName}! Я помогу тебе с миграцией токенов. Для выполнения миграции используйте команду /migrate.`);
});

// Обработка команды /migrate
bot.on('callback_query', async (query) => {
  const chatId = query.message.chat.id;
  const data = query.data;

  if (data === 'migrate') {
    bot.sendMessage(chatId, 'Пожалуйста, отправьте mint_id токена для миграции.');
  }
});

// Команда /migrate $token
bot.onText(/\/migrate (.+)/, async (msg, match) => {
  const chatId = msg.chat.id;
  const mintId = match[1].trim(); // Получаем mint_id из команды

  if (!mintId) {
    bot.sendMessage(chatId, `Ошибка: mint_id обязателен.`);
    return;
  }

  // Логируем запрос на добавление токена
  console.log(`Получен запрос на добавление токена ${mintId}`);

  // Сохраняем связь mint_id и chatId
  userRequests[mintId] = chatId;

  // Проверяем, существует ли уже токен в базе
  const existingTokenResult = await client.query(
    'SELECT * FROM tokens WHERE mint_id = $1',
    [mintId]
  );

  if (existingTokenResult.rows.length > 0) {
    bot.sendMessage(chatId, `Токен с mint_id ${mintId} уже существует в базе данных.`);
    return;
  }

  try {
    // Добавляем mint_id в базу данных
    const result = await client.query(
      'INSERT INTO tokens (mint_id) VALUES ($1) RETURNING id',
      [mintId]
    );
    const tokenId = result.rows[0].id;

    // Уведомление в чат, из которого поступил запрос
    bot.sendMessage(chatId, `🕔Токен ${mintId} добавлен в базу данных.`);

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
    console.error('Error fetching migration status from Raydium:', error.message);
    return [];
  }
};

// Постоянная проверка токенов в базе

const checkMigrationStatusContinuously = async () => {
  try {
    const result = await client.query('SELECT mint_id FROM tokens');

    for (const row of result.rows) {
      const chatId = userRequests[row.mint_id];  // Получаем chatId для данного mint_id

      if (chatId) {  // Если chatId найден, отправляем сообщение
        console.log(`Проверяем токен с mint_id ${row.mint_id} на миграцию...`);
        const migrationStatus = await getMigrationStatus([row.mint_id]);

        console.log(migrationStatus[0]);

        if (migrationStatus[0] !== null) {
          const mintId = row.mint_id;  // mint_id токена
          const programId = migrationStatus[0].programId;  // Получаем programId из ответа

          // Формируем URL для кнопки
          const photonUrl = `https://photon-sol.tinyastro.io/en/lp/${programId}`;

          // Формируем сообщение с inline клавиатурой и форматированием
          bot.sendMessage(chatId, `✅Токен \`${mintId}\` был успешно мигрирован!`, { parse_mode: 'Markdown' });

          bot.sendMessage(chatId, message);  // Отправляем сообщение с клавиатурой

          // Удаляем токен из базы
          await client.query('DELETE FROM tokens WHERE mint_id = $1', [mintId]);
          console.log(`Токен с mint_id ${mintId} удален из базы.`);
        }
      }

      // Пауза между проверками каждого токена
      await new Promise(resolve => setTimeout(resolve, 500));
    }
  } catch (error) {
    console.error('Ошибка в проверке миграции токенов:', error);
  }

  // Повторяем проверку каждые 2 секунды
  setTimeout(checkMigrationStatusContinuously, 2000);
};

// Запуск проверки
checkMigrationStatusContinuously();

// Указываем порт, предоставленный Render
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});
