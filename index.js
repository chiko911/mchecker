const { Client } = require('pg'); // Импортируем клиент PostgreSQL
const fetch = require('node-fetch');
const TelegramBot = require('node-telegram-bot-api');

// Установите ваш токен Telegram бота
const token = process.env.TELEGRAM_BOT_TOKEN;
const bot = new TelegramBot(token, { polling: true });

// Создание клиента для работы с PostgreSQL
const client = new Client({
    user: process.env.PG_USER,
    host: process.env.PG_HOST,
    database: process.env.PG_DB,
    password: process.env.PG_PASSWORD,
    port: process.env.PG_PORT,
});

client.connect(); // Подключаемся к базе данных PostgreSQL

// Проверка миграции токенов через API
async function checkTokenMigration(token) {
    const url = `https://api-v3.raydium.io/mint/ids?mints=${token}`;
    const response = await fetch(url);
    const data = await response.json();

    // Если массив data не пустой, значит миграция прошла успешно
    if (data.success && data.data.length > 0) {
        return true;  // Успешная миграция
    }
    return false;  // Миграция не прошла
}

// Функция для добавления токена в базу данных
async function addTokenToDatabase(token) {
    const query = 'INSERT INTO tokens (token, checked) VALUES ($1, false)';
    await client.query(query, [token]);
}

// Функция для получения всех токенов из базы данных
async function getTokensFromDatabase() {
    const res = await client.query('SELECT * FROM tokens WHERE checked = false');
    return res.rows;
}

// Функция для обновления статуса токена в базе данных
async function updateTokenStatus(token, status) {
    const query = 'UPDATE tokens SET checked = $1 WHERE token = $2';
    await client.query(query, [status, token]);
}

// Функция отправки сообщения в Telegram
async function sendTelegramMessage(chatId, message) {
    await bot.sendMessage(chatId, message);
}

// Основной цикл для проверки миграции токенов
async function checkTokens() {
    const tokens = await getTokensFromDatabase();

    for (const token of tokens) {
        const migrated = await checkTokenMigration(token.token);

        if (migrated) {
            // Отправляем сообщение в чат Telegram, если миграция прошла успешно
            const chatId = token.chat_id; // Получаем chat_id из базы данных
            await sendTelegramMessage(chatId, `Токен ${token.token} успешно мигрировал!`);

            // Обновляем статус токена в базе данных
            await updateTokenStatus(token.token, true);  // Устанавливаем checked = true
        }
    }
}

// Таймер для периодической проверки
setInterval(checkTokens, 60000); // Проверяем токены каждую минуту

// Обработчик команд от бота
bot.onText(/\/addtoken (.+)/, async (msg, match) => {
    const chatId = msg.chat.id;
    const token = match[1];

    // Добавляем токен в базу данных
    await addTokenToDatabase(token);

    // Отправляем подтверждение
    await sendTelegramMessage(chatId, `Токен ${token} добавлен в очередь для проверки!`);
});

// Закрытие подключения к базе данных при завершении работы
process.on('exit', () => {
    client.end();
});
