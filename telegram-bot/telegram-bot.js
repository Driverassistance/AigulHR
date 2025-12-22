const TelegramBot = require('node-telegram-bot-api');
const axios = require('axios');

// 🔑 КОНФИГУРАЦИЯ
require('dotenv').config();

const TELEGRAM_TOKEN = process.env.BOT_TOKEN;
const CLAUDE_API_KEY = process.env.CLAUDE_API_KEY; 
const AIRTABLE_API_KEY = process.env.AIRTABLE_API_KEY;
const AIRTABLE_BASE_ID = process.env.AIRTABLE_BASE_ID;
const ADMINS = [
    473294026, // ← ТВОЙ Telegram ID
    987654321  // ← Telegram ID Динары
];
function isAdmin(userId) {
    return ADMINS.includes(userId);
}
function isTestDone(text) {
  const t = (text || '').toLowerCase();
  return ['готово', 'прошел', 'прошёл', 'сдал', 'завершил', 'закончил'].some(w => t.includes(w));
}


// WhatsApp бот URL (когда запустим локально)
const WHATSAPP_BOT_URL = 'http://localhost:3002';
const dialogues = new Map();


// 🤖 Инициализация бота
console.log("BOT_TOKEN exists:", !!process.env.BOT_TOKEN);
const bot = new TelegramBot(TELEGRAM_TOKEN, { polling: true });
// 🧠 PROMPT Айгуль (если не задан в .env — используем дефолт)
const AIGUL_PROMPT = process.env.AIGUL_PROMPT || `
Ты — Айгуль, AI-рекрутер (HR) компании HappySnack (Алматы).
Твоя цель: заинтересовать кандидата на позицию торгового представителя и довести до прохождения теста.

Правила:
- Пиши по-русски, дружелюбно, короткими сообщениями.
- Сначала 2–3 вопроса: опыт, город/район, готовность к разъездам, мотивация.
- Не дави. Если сомневается — дай 1–2 аргумента и спроси, готов ли пройти тест.
- Когда кандидат готов — попроси пройти тест и дождись подтверждения.

Формат:
- Без лишних вступлений.
- Одно сообщение = одна мысль.
`;

console.log('🤖 Telegram бот @HappySnackHR_bot запущен!');
console.log('📱 Готов координировать Айгуль!');
// ================================
// 🧠 AIGUL — CLAUDE CORE
// ================================

// 🔌 Вызов Claude
async function callClaudeAPI(message) {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'x-api-key': CLAUDE_API_KEY,
            'anthropic-version': '2023-06-01'  // 👈 ВОТ ЭТО ДОБАВЬ
        },
        body: JSON.stringify({
            model: 'claude-sonnet-4-5-20250929',
            max_tokens: 300,
            system: AIGUL_PROMPT,
            messages: [
                {
                    role: 'user',
                    content: message
                }
            ]
        })
    });
    
    if (!response.ok) {
        const errText = await response.text();
        throw new Error(`Claude API error ${response.status}: ${errText}`); // 👈 И тут скобки исправь
    }
    
    const data = await response.json();
    return data.content[0].text;
}


// 📊 СОСТОЯНИЕ СИСТЕМЫ
let systemStats = {
    totalCandidates: 0,
    activeDialogues: 0,
    testsCompleted: 0,
    lastActivity: null
};

// 🎯 ОСНОВНЫЕ КОМАНДЫ

// /start - Приветствие
bot.onText(/\/start/, (msg) => {
    const chatId = msg.chat.id;
    const userId = msg.from.id;

    if (isAdmin(userId)) {
        const adminWelcome = `
🤖 *Айгуль HR Система Активна!*

Привет! Я координатор AI рекрутера Айгуль.

*Доступные команды:*
/add - Добавить кандидата
/stats - Статистика системы  
/status - Состояние всех компонентов
/candidates - Список кандидатов
/help - Помощь

Система готова к работе! 🚀
        `;
        bot.sendMessage(chatId, adminWelcome, { parse_mode: 'Markdown' });
    } else {
        // кандидат — просто начинаем диалог
        bot.sendMessage(
            chatId,
            'Привет! 👋\n\nМеня зовут Айгуль, я HR-специалист компании HappySnack.\nДавай немного познакомимся 🙂'
        );
    }
});

bot.onText(/\/test/, async (msg) => {
    const chatId = msg.chat.id;

    await bot.sendMessage(chatId, '🧠 Тестирую связь с Claude...');

    try {
        const response = await callClaudeAPI(
            'Привет! Это тест связи. Ответь коротко что ты Айгуль.'
        );

        await bot.sendMessage(
            chatId,
            `✅ Claude отвечает:\n\n${response}`
        );
    } catch (error) {
        await bot.sendMessage(
            chatId,
            `❌ Ошибка Claude API:\n${error.message}`
        );
    }
});

// /add - Добавить кандидата вручную
bot.onText(/\/add (.+)/, async (msg, match) => {
	if (!isAdmin(msg.from.id)) {
    return bot.sendMessage(msg.chat.id, '⛔ Эта команда доступна только HR');
}
    const chatId = msg.chat.id;
    const params = match[1].split(' ');
    
    if (params.length < 3) {
        bot.sendMessage(chatId, `
❌ *Неверный формат!*

*Правильно:*
\`/add +77051234567 "Асет Мухтаров" hh.kz\`

*Параметры:*
1. Телефон (+7...)
2. Имя (в кавычках если есть пробелы)
3. Источник (hh.kz, rabota.kz, LinkedIn, etc)
        `, { parse_mode: 'Markdown' });
        return;
    }
    
    const phone = params[0];
    const name = params[1].replace(/"/g, '');
    const source = params[2] || 'telegram';
    
    try {
        // Добавляем кандидата в Airtable
        const newCandidate = await addCandidateToAirtable({
            name,
            phone,
            source,
            status: 'Новый',
            addedBy: 'Telegram @' + (msg.from.username || msg.from.first_name)
        });
        console.log('🔥 ПОПЫТКА ЗАПУСКА WHATSAPP ДИАЛОГА'); // ДОБАВЬ ЭТУ СТРОКУ
        // Запускаем WhatsApp диалог
        startWhatsAppDialogue(newCandidate).catch(err => {
        console.log('❌ WhatsApp недоступен:', err.message);
    });
        
        bot.sendMessage(chatId, `
✅ *Кандидат добавлен успешно!*

👤 *${name}*
📞 ${phone}
📋 Источник: ${source}
🤖 Айгуль начинает диалог...

ID: ${newCandidate.id}
        `, { parse_mode: 'Markdown' });
        
        // Обновляем статистику
        systemStats.totalCandidates++;
        systemStats.lastActivity = new Date().toLocaleString('ru-RU');
        
    } catch (error) {
        console.error('Ошибка добавления кандидата:', error);
        bot.sendMessage(chatId, '❌ Ошибка: ' + error.message);
    }
});

// /stats - Статистика системы
bot.onText(/\/stats/, async (msg) => {
    if (!isAdmin(msg.from.id)) {
    return bot.sendMessage(msg.chat.id, '⛔ Эта команда доступна только HR');
}
	const chatId = msg.chat.id;
    
    try {
        const stats = await getSystemStats();
        const message = `
📊 *СТАТИСТИКА АЙГУЛЬ HR*

👥 *Кандидаты:* ${stats.totalCandidates}
💬 *Активные диалоги:* ${stats.activeDialogues}
✅ *Тесты пройдены:* ${stats.testsCompleted}
📈 *Конверсия:* ${stats.conversionRate}%

🕐 *Последняя активность:* ${stats.lastActivity || 'нет данных'}

*По статусам:*
🆕 Новые: ${stats.statusCounts.new || 0}
💬 В диалоге: ${stats.statusCounts.dialogue || 0}  
📝 Тест отправлен: ${stats.statusCounts.testSent || 0}
✅ Тест пройден: ${stats.statusCounts.testPassed || 0}
👥 Переданы РОПу: ${stats.statusCounts.sentToROP || 0}
        `;
        
        bot.sendMessage(chatId, message, { parse_mode: 'Markdown' });
        
    } catch (error) {
        bot.sendMessage(chatId, '❌ Ошибка получения статистики: ' + error.message);
    }
});

// /status - Проверка компонентов системы
bot.onText(/\/status/, async (msg) => {
    if (!isAdmin(msg.from.id)) {
    return bot.sendMessage(msg.chat.id, '⛔ Эта команда доступна только HR');
}
	const chatId = msg.chat.id;
    
    const statuses = await checkSystemComponents();
    
    const message = `
🔧 *СТАТУС СИСТЕМЫ*

${statuses.dashboard ? '✅' : '❌'} Dashboard (localhost:3001)
${statuses.whatsapp ? '✅' : '❌'} WhatsApp бот (localhost:3002)  
${statuses.claude ? '✅' : '❌'} Claude API
${statuses.airtable ? '✅' : '❌'} Airtable Database
${statuses.telegram ? '✅' : '❌'} Telegram бот (этот)

*Готовность системы:* ${Object.values(statuses).filter(Boolean).length}/5 компонентов

${Object.values(statuses).every(Boolean) ? '🚀 Система полностью готова!' : '⚠️ Требуется настройка компонентов'}
    `;
    
    bot.sendMessage(chatId, message, { parse_mode: 'Markdown' });
});

// 📨 WEBHOOK для Dashboard
// Когда Dashboard добавляет кандидата, он отправляет POST запрос сюда
bot.on('webhook_error', (error) => {
    console.error('Webhook error:', error);
});

// 🔄 ФУНКЦИИ РАБОТЫ С ДАННЫМИ


// Добавление кандидата в Airtable
async function addCandidateToAirtable(candidateData) {
    try {
        const response = await axios.post(
            'https://api.airtable.com/v0/' + AIRTABLE_BASE_ID + '/КАНДИДАТЫ',
            {
                fields: {
                    'Имя': candidateData.name,
                    'Телефон': candidateData.phone,
                    'Email': candidateData.email || '',
                    'Источник': candidateData.source === 'telegram' ? 'рекомендация' : candidateData.source,
                    'Статус': 'Новый',
                                    }
            },
            {
                headers: {
                    'Authorization': 'Bearer ' + AIRTABLE_API_KEY,
                    'Content-Type': 'application/json'
                }
            }
        );
        
        // Возвращаем объект с оригинальными полями + Airtable ID
        return {
            id: response.data.id,
            name: candidateData.name,           // Оригинальные данные
            phone: candidateData.phone,         // Оригинальные данные
            email: candidateData.email || '',   // Оригинальные данные
            source: candidateData.source,       // Оригинальные данные
            status: 'Новый'
        };
        
    } catch (error) {
        throw new Error('Ошибка Airtable: ' + (error.response?.data?.error?.message || error.message));
    }
}
// Запуск WhatsApp диалога
async function startWhatsAppDialogue(candidate) {
    try {
        const response = await axios.post(WHATSAPP_BOT_URL + '/start-dialogue', {
            candidateId: candidate.id,
            phone: candidate.phone,
            name: candidate.name,
            source: candidate.source
        });
        
        console.log('🚀 WhatsApp диалог запущен для ' + candidate.name);
        return response.data;
        
    } catch (error) {
        console.error('Ошибка запуска WhatsApp диалога:', error.message);
        throw new Error('WhatsApp бот недоступен');
    }
}

// Получение статистики системы
async function getSystemStats() {
    try {
        // Получаем данные из Airtable
        const response = await axios.get(
            'https://api.airtable.com/v0/' + AIRTABLE_BASE_ID + '/КАНДИДАТЫ',
            {
                headers: {
                    'Authorization': 'Bearer ' + AIRTABLE_API_KEY
                }
            }
        );
        
        const candidates = response.data.records;
        const statusCounts = {};
        
        candidates.forEach(record => {
            const status = record.fields['Статус'] || 'Новый';
            statusCounts[status] = (statusCounts[status] || 0) + 1;
        });
        
        const testsPassed = statusCounts['Тест пройден'] || 0;
        const totalCandidates = candidates.length;
        const conversionRate = totalCandidates > 0 ? Math.round((testsPassed / totalCandidates) * 100) : 0;
        
        return {
            totalCandidates,
            activeDialogues: statusCounts['В диалоге'] || 0,
            testsCompleted: testsPassed,
            conversionRate,
            lastActivity: systemStats.lastActivity,
            statusCounts: {
                new: statusCounts['Новый'] || 0,
                dialogue: statusCounts['В диалоге'] || 0,
                testSent: statusCounts['Тест отправлен'] || 0,
                testPassed: statusCounts['Тест пройден'] || 0,
                sentToROP: statusCounts['Передан РОПу'] || 0
            }
        };
        
    } catch (error) {
        throw new Error('Ошибка получения статистики: ' + error.message);
    }
}

// Проверка компонентов системы
async function checkSystemComponents() {
    const statuses = {
        telegram: true, // Этот бот работает
        dashboard: false,
        whatsapp: false,
        claude: false,
        airtable: false
    };
    
    // Проверяем Dashboard
    try {
        await axios.get('http://localhost:3001/api/stats', { timeout: 5000 });
        statuses.dashboard = true;
    } catch (error) {
        console.log('Dashboard недоступен');
    }
    
    // Проверяем WhatsApp бота
    try {
        await axios.get(WHATSAPP_BOT_URL + '/status', { timeout: 5000 });
        statuses.whatsapp = true;
    } catch (error) {
        console.log('WhatsApp бот недоступен');
    }
    
    // Проверяем Claude API
    try {
        await axios.post('https://api.anthropic.com/v1/messages', {
            model: 'claude-3-sonnet-20240229',
            max_tokens: 10,
            messages: [{ role: 'user', content: 'test' }]
        }, {
            headers: {
                'x-api-key': CLAUDE_API_KEY,
                'anthropic-version': '2023-06-01',
                'content-type': 'application/json'
            },
            timeout: 10000
        });
        statuses.claude = true;
    } catch (error) {
        console.log('Claude API недоступен');
    }
    
    // Проверяем Airtable
    try {
        await axios.get(
            'https://api.airtable.com/v0/' + AIRTABLE_BASE_ID + '/КАНДИДАТЫ?maxRecords=1',
            {
                headers: { 'Authorization': 'Bearer ' + AIRTABLE_API_KEY },
                timeout: 5000
            }
        );
        statuses.airtable = true;
    } catch (error) {
        console.log('Airtable недоступен');
    }
    
    return statuses;
}

// 🚨 ОБРАБОТКА ОШИБОК
bot.on('error', (error) => {
    console.error('Ошибка Telegram бота:', error);
});
// 💬 Диалог кандидата с Айгуль (обычные сообщения)
bot.on('message', async (msg) => {
	const chatId = msg.chat.id;
const text = msg.text || '';

const state = dialogues.get(chatId) || { step: 'intro' };

if (state.step === 'waiting_test_done' && isTestDone(text)) {
    // 1) подтверждаем кандидату
    await bot.sendMessage(
        chatId,
        `Спасибо 🙌\n\n` +
        `Я зафиксировала, что вы прошли тест.\n` +
        `В ближайшее время с вами свяжется супервайзер.\n\n` +
        `📞 Динара: +7 700 080 4848 (WhatsApp)`
    );

    // 2) уведомляем Динару (Telegram)
    const candidateName = msg.from.first_name || 'Кандидат';
    const username = msg.from.username ? `@${msg.from.username}` : '—';

    await bot.sendMessage(
        DINARA_TELEGRAM_ID, // ⚠️ вставим на шаге 2
        `✅ ТЕСТ ПРОЙДЕН\n\n` +
        `👤 ${candidateName}\n` +
        `🆔 Telegram ID: ${msg.from.id}\n` +
        `👤 Username: ${username}\n\n` +
        `🔗 Тест: https://happysnacktest.netlify.app/`
    );

    // 3) обновляем состояние
    state.step = 'test_done';
    state.test_done_at = new Date().toISOString();
    dialogues.set(chatId, state);

    return; // ⛔ дальше не идём
}

        if (!text || text.startsWith('/')) return;

    // получаем состояние диалога
    

    let prompt = '';

    if (state.step === 'intro') {
        prompt = `
Ты Айгуль — AI-рекрутер HappySnack.
Это ПЕРВОЕ сообщение кандидату.

Поздоровайся и уточни:
— есть ли опыт в продажах или работе с клиентами.

Сообщение кандидата:
"${text}"
        `;
        state.step = 'experience';
    }

    else if (state.step === 'experience') {
        prompt = `
Ты Айгуль — AI-рекрутер HappySnack.
Кандидат ответил про опыт.

Продолжи диалог:
— уточни город/район
— спроси готов ли рассмотреть работу торговым представителем.

Сообщение кандидата:
"${text}"
        `;
        state.step = 'interest';
    }

    else if (state.step === 'interest') {
    const normalized = text.toLowerCase();

    // если кандидат готов к тесту
    if (
        normalized.includes('готов') ||
        normalized.includes('да') ||
        normalized.includes('хочу') ||
        normalized.includes('соглас')
    ) {
        state.step = 'test_ready';

        await bot.sendMessage(
            chatId,
            'Отлично! Тогда давай перейдём к следующему шагу 👇',
            {
                reply_markup: {
                    inline_keyboard: [
                        [
                            {
                                text: '📝 Пройти тест',
                                callback_data: 'start_test'
                            }
                        ]
                    ]
                }
            }
        );

        dialogues.set(chatId, state);
        return;
    }

    // если ещё сомневается — продолжаем диалог
    prompt = `
Ты Айгуль — AI-рекрутер HappySnack.
Кандидат пока не дал чёткого согласия.

Коротко поддержи и ещё раз предложи пройти тест.
Сообщение кандидата:
"${text}"
    `;
}

    else {
        prompt = `
Ты Айгуль — AI-рекрутер HappySnack.
Поддержи диалог вежливо и по делу.

Сообщение кандидата:
"${text}"
        `;
    }

    dialogues.set(chatId, state);

    try {
        const reply = await callClaudeAPI(prompt);
        await bot.sendMessage(chatId, reply);
    } catch (err) {
        console.error(err);
        await bot.sendMessage(chatId, '❌ Давай попробуем ещё раз 🙂');
    }
});

bot.on('callback_query', async (query) => {
    const chatId = query.message.chat.id;

    if (query.data === 'start_test') {
        await bot.answerCallbackQuery(query.id);

        const tgId = query.from.id;
        const name = encodeURIComponent(query.from.first_name || 'Кандидат');

        const testLink = `https://happysnacktest.netlify.app/?tg_id=${tgId}&name=${name}`;

        await bot.sendMessage(
            chatId,
            `📝 Отлично! Тогда давай пройдём небольшой тест 👇\n\n` +
            `Он поможет понять, насколько эта работа тебе подходит и где ты сможешь быстрее вырасти.\n\n` +
            `👉 ${testLink}\n\n` +
            `После прохождения просто напиши сюда «Готово».`
        );

        const userState = dialogues.get(chatId) || {};
userState.step = 'waiting_test_done';
dialogues.set(chatId, userState);

    }
});


bot.on('polling_error', (error) => {
    console.error('Ошибка polling:', error);
});

// 📊 ПЕРИОДИЧЕСКИЕ ОТЧЕТЫ
setInterval(async () => {
    try {
        const stats = await getSystemStats();
        
        // Отправляем отчет каждые 6 часов (можно настроить)
        if (new Date().getHours() % 6 === 0 && new Date().getMinutes() === 0) {
            // Здесь можно отправить отчет в группу или канал
            console.log('📊 Автоматический отчет:', stats);
        }
    } catch (error) {
        console.error('Ошибка автоотчета:', error);
    }
}, 60000); // Проверяем каждую минуту

console.log('✅ Telegram бот готов к работе!');
console.log('📱 Команды: /start, /add, /stats, /status');
console.log('🔗 Готов к интеграции с Dashboard и WhatsApp');

module.exports = bot;