import express from 'express'; // Импортируем express
import pkg from 'pg'; // Импортируем pg для работы с PostgreSQL
import TelegramBot from 'node-telegram-bot-api'; // Импортируем Telegram Bot API
import dotenv from 'dotenv'; // Для работы с переменными окружения
import fetch from 'node-fetch'; // Для работы с HTTP запросами (Raydium API)

dotenv.config(); // Загружаем переменные из .env файла

const app = express(); // Инициализируем Express приложение
const port = process.env.PORT || 3000; // Устанавливаем порт, либо по умолчанию 3000

// Подключение к PostgreSQL
const { Client } = pkg; // Получаем Client из импорта
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
const bot = new TelegramBot(token, { polling: false }); // Отключаем polling и используем webhook

// Устанавливаем вебхук для получения обновлений от Telegram
const webhookUrl = `https://yourdomain.com/${process.env.TELEGRAM_BOT_TOKEN}`; // URL вашего хостинга
bot.setWebHook(webhookUrl);

// Обработка команды /start
bot.onText(/\/start/, (msg) => {
  const chatId = msg.chat.id;
  const firstName = msg.from.first_name;
  const greetingMessage = `Привет, ${firstName}! Я помогу тебе с миграцией токенов. Чем могу помочь?`;

  bot.sendMessage(chatId, greetingMessage);
});

// Команда /migrate $token
bot.onText(/\/migrate (.+)/, async (msg, match) => {
  const chatId = msg.chat.id;
  const tokenSymbol = match[1]; // Получаем название токена из команды

  try {
    // Добавляем токен в базу данных
    const result = await client.query('INSERT INTO tokens (symbol) VALUES ($1) RETURNING id', [tokenSymbol]);
    const tokenId = result.rows[0].id; // Получаем ID добавленного токена

    bot.sendMessage(chatId, `Токен ${tokenSymbol} добавлен в базу данных для миграции. Мы будем проверять его статус.`);
    console.log(`Токен ${tokenSymbol} добавлен в базу с ID ${tokenId}`);
  } catch (err) {
    console.error('Ошибка добавления токена в базу:', err);
    bot.sendMessage(chatId, `Произошла ошибка при добавлении токена ${tokenSymbol} в базу данных.`);
  }
});

// Получение статуса миграции токена из Raydium API
const getMigrationStatus = async (mintIds) => {
  const url = `https://api-v3.raydium.io/mint/ids?mints=${mintIds.join(',')}`; // Собираем URL запроса с несколькими mintId
  try {
    console.log(`Запрос к Raydium API с mintIds: ${mintIds.join(', ')}`); // Логирование запроса
    const response = await fetch(url);
    const data = await response.json();
    console.log(`Ответ от Raydium API:`, data); // Логирование ответа
    return data.data || []; // Возвращаем массив данных о токенах, если есть
  } catch (error) {
    console.error('Error fetching migration status from Raydium', error);
    return [];
  }
};

// Постоянная проверка миграции токенов
const checkMigrationStatusContinuously = async () => {
  console.log('Запуск постоянной проверки статуса миграции токенов');
  
  try {
    // Получаем все токены из базы данных
    const result = await client.query('SELECT symbol, mint_id FROM tokens');
    
    for (const row of result.rows) {
      console.log(`Проверяем миграцию для токена: ${row.symbol}`);

      // Запрашиваем статус миграции с Raydium API для текущего токена
      const migrationStatus = await getMigrationStatus([row.mint_id]);

      if (migrationStatus.length > 0) {
        console.log(`Токен ${row.symbol} мигрирован!`);
        // Отправляем уведомление в Telegram
        bot.sendMessage(process.env.TELEGRAM_ADMIN_CHAT_ID, `Токен ${row.symbol} был мигрирован!`);

        // Удаляем токен из базы данных после миграции
        await client.query('DELETE FROM tokens WHERE symbol = $1', [row.symbol]);
        console.log(`Токен ${row.symbol} удален из базы данных после миграции.`);
      } else {
        console.log(`Токен ${row.symbol} еще не мигрирован.`);
      }
    }

    // Повторяем запрос через 5 секунд
    setTimeout(checkMigrationStatusContinuously, 5000); // Запрос каждые 5 секунд
  } catch (error) {
    console.error('Ошибка в процессе постоянной проверки миграции токенов:', error);
    setTimeout(checkMigrationStatusContinuously, 5000); // Продолжаем проверку через 5 секунд при ошибке
  }
};

// Запуск постоянной проверки статуса миграции
checkMigrationStatusContinuously();

// Обработка запроса от Telegram через вебхук
app.use(express.json());

app.post(`/${process.env.TELEGRAM_BOT_TOKEN}`, (req, res) => {
  bot.processUpdate(req.body); // Обрабатываем входящие обновления
  res.sendStatus(200); // Отправляем статус 200 в ответ
});

// Запуск сервера
app.listen(port, () => {
  console.log(`Server is running on port ${port}`);
});
