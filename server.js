const express = require('express');
const path = require('path');
const cors = require('cors');
const axios = require('axios');

const AIRTABLE_API_KEY = process.env.AIRTABLE_API_KEY;
const AIRTABLE_BASE_ID = process.env.AIRTABLE_BASE_ID;
const app = express();
const PORT = process.env.PORT || 3001;
// ===== Telegram webhook forward (Dashboard -> Railway Bot) =====
const TELEGRAM_WEBHOOK_FORWARD_URL = process.env.TELEGRAM_WEBHOOK_FORWARD_URL; 
// пример: https://<твоя-railway-служба>.up.railway.app/telegram-webhook
const TELEGRAM_WEBHOOK_SECRET = process.env.TELEGRAM_WEBHOOK_SECRET; 
// любой секрет, чтобы никто не слал тебе левак
const WHATSAPP_BOT_URL = process.env.WHATSAPP_BOT_URL; 
// пример: https://<whatsapp-service>/start-dialogue


// Middleware (НО БЕЗ СТАТИЧЕСКИХ ФАЙЛОВ ПОКА!)
app.use(cors());
app.use(express.json());
// ======================
// 🔔 WEBHOOK: ТЕСТ ПРОЙДЕН (Netlify)
// ======================
app.post('/webhook/netlify/test-completed', async (req, res) => {
    try {
        const data = req.body;

        console.log('📥 Netlify test completed:', data);

        const name = data.name || '—';
        const phone = data.phone || '—';
        const telegramId = data.telegram_id || '—';
        const score = data.total_score || data.score || '—';

        const message =
`✅ ТЕСТ ПРОЙДЕН

👤 Имя: ${name}
📞 Телефон: ${phone}
🆔 Telegram ID: ${telegramId}

📊 Результат теста: ${score}%

Рекомендуется связаться с кандидатом.`;

        // ⚠️ временно: подставишь реальные ID
        const DINARA_TELEGRAM_ID = process.env.DINARA_TELEGRAM_ID;
        const OWNER_TELEGRAM_ID = process.env.OWNER_TELEGRAM_ID;
        const TG_BOT_TOKEN = process.env.TG_BOT_TOKEN;

        async function sendTG(chatId) {
            if (!chatId) return;
            await axios.post(`https://api.telegram.org/bot${TG_BOT_TOKEN}/sendMessage`, {
                chat_id: chatId,
                text: message
            });
        }

        await sendTG(DINARA_TELEGRAM_ID);
        await sendTG(OWNER_TELEGRAM_ID);

        res.status(200).json({ ok: true });

    } catch (error) {
        console.error('❌ Netlify webhook error:', error.message);
        res.status(500).json({ ok: false });
    }
});

// ======================
// ТЕСТОВЫЕ ДАННЫЕ 
// ======================
let candidates = [
    {
        id: 1,
        name: "Асет Жумагулов",
        phone: "+77051234567",
        email: "aset@example.com",
        source: "hh.kz", 
        status: "В диалоге",
        language: "русский",
        dateAdded: "2025-10-15",
        lastContact: "2025-10-17",
        reminders: 1,
        testResult: null,
        comments: "Заинтересован в вакансии",
        dialogue: [
            {
                timestamp: "2025-10-17 10:30",
                from: "aigul",
                message: "Салем! Меня зовут Айгуль, я HR агент компании HappySnack."
            },
            {
                timestamp: "2025-10-17 10:35", 
                from: "candidate",
                message: "Здравствуйте! Интересно, расскажите подробнее"
            }
        ]
    },
    {
        id: 2,
        name: "Динара Смагулова",
        phone: "+77019876543",
        email: "dinara@example.com",
        source: "rabota.kz",
        status: "Тест отправлен", 
        language: "казахский",
        dateAdded: "2025-10-16",
        lastContact: "2025-10-17",
        reminders: 0,
        testResult: null,
        comments: "Отправила ссылку на тест",
        dialogue: []
    },
    {
        id: 3,
        name: "Марат Нурланов",
        phone: "+77077777777", 
        email: "marat@example.com",
        source: "LinkedIn",
        status: "Тест пройден",
        language: "русский",
        dateAdded: "2025-10-14",
        lastContact: "2025-10-16",
        reminders: 0,
        testResult: 85,
        comments: "Отличный результат теста",
        dialogue: []
    }
];

let settings = {
    salary_min: "150,000₸",
    salary_max: "200,000₸",
    commission_min: "3%", 
    commission_max: "7%",
    real_income: "250,000-500,000₸+",
    test_link: "https://happysnacktest.netlify.app/",
    dinara_phone: "+7 700 080 4848",
    company_email: "info@happysnack.kz",
    office_address: "г. Алматы, ул. Суюнбая 263",
    max_reminders: 3,
    message_interval: "2 дня",
    work_hours: "9:00-18:00",
    default_language: "автоопределение"
};

let scripts = {
    greeting_ru: "Привет! Меня зовут Айгуль 🤖\n\nЯ HR агент компании HappySnack. Мы ищем торговых представителей в Алматы.\n\nВы заинтересованы в работе с доходом от 250,000₸?",
    greeting_kz: "Сәлем! Менің атым Айгүл 🤖\n\nМен HappySnack компаниясының HR агентімін. Біз Алматыда сауда өкілдерін іздеп жатырмыз.\n\nСіз 250,000₸-ден жоғары табыс әкелетін жұмысқа қызығасыз ба?",
    vacancy_presentation_ru: "🎯 ВАКАНСИЯ: Торговый представитель\n\n💰 ДОХОДЫ:\n• Базовый оклад: {salary_min}-{salary_max}\n• % с продаж: {commission_min}-{commission_max}\n• Реальный доход: {real_income}\n\nВас заинтересовала вакансия?",
    test_motivation_ru: "Отлично! 🎉\n\nДля знакомства с компанией пройдите короткий тест (5-7 минут).\n\n🔗 Ссылка: {test_link}\n\nПройдете сегодня?",
    reminder_1_ru: "Напоминаю про тест 📝\n\nСсылка: {test_link}\n\nВопросы есть?"
};

// ======================
// API РОУТЫ СНАЧАЛА! 
// ======================

// 📊 Статистика Dashboard
app.get('/api/stats', (req, res) => {
    console.log('📊 Запрос статистики');
    
    const stats = {
        totalCandidates: candidates.length,
        testsSent: candidates.filter(c => ['Тест отправлен', 'Тест пройден', 'Передан РОПу'].includes(c.status)).length,
        testsPassed: candidates.filter(c => c.status === 'Тест пройден' || c.status === 'Передан РОПу').length,
        conversionRate: Math.round((candidates.filter(c => c.testResult !== null).length / candidates.length) * 100) || 0,
        handedToROP: candidates.filter(c => c.status === 'Передан РОПу').length
    };
    
    res.json(stats);
});

// 👥 Все кандидаты
app.get('/api/candidates', (req, res) => {
    console.log('👥 Запрос списка кандидатов');
    res.json(candidates);
});

// ➕ Добавить кандидата
app.post('/api/candidates', async (req, res) => {
    console.log('➕ Добавление кандидата:', req.body);
    
    const { name, phone, email, source } = req.body;
    
    if (!name || !phone || !source) {
        return res.status(400).json({ error: 'Имя, телефон и источник обязательны' });
    }
    
    try {
        // Отправляем в Airtable
        const airtableResponse = await axios.post(
            `https://api.airtable.com/v0/${AIRTABLE_BASE_ID}/КАНДИДАТЫ`,
            {
                fields: {
                    'Имя': name,
                    'Телефон': phone,
                    'Email': email || '',
                    'Источник': source,
                    'Статус': 'Новый'
                }
            },
            {
                headers: {
                    'Authorization': `Bearer ${AIRTABLE_API_KEY}`,
                    'Content-Type': 'application/json'
                }
            }
        );
        
        const newCandidate = {
            id: airtableResponse.data.id,
            name,
            phone,
            email: email || '',
            source,
            status: "Новый"
        };
        
        // Добавляем и в локальный массив для совместимости
        candidates.push(newCandidate);
        
        console.log(`✅ Кандидат добавлен в Airtable: ${name}`);
        
        // НОВЫЙ БЛОК: Уведомляем WhatsApp бота
        try {
            if (WHATSAPP_BOT_URL) {
    await axios.post(WHATSAPP_BOT_URL, {
        phone: newCandidate.phone,
        name: newCandidate.name,
        source: newCandidate.source
    });
    console.log('🚀 WhatsApp диалог запущен для', newCandidate.name);
} else {
    console.log('ℹ️ WHATSAPP_BOT_URL не задан — WhatsApp интеграция отключена');
}

        
        res.status(201).json(newCandidate);
        
    } catch (error) {
        console.error('❌ Ошибка Airtable:', error.response?.data || error.message);
        res.status(500).json({ error: 'Ошибка добавления в базу данных' });
    }
});

// 🔄 Обновить кандидата  
app.put('/api/candidates/:id', (req, res) => {
    const { id } = req.params;
    const updates = req.body;
    
    console.log(`🔄 Обновление кандидата ${id}:`, updates);
    
    const candidateIndex = candidates.findIndex(c => String(c.id) === String(id));

    
    if (candidateIndex === -1) {
        return res.status(404).json({ error: 'Кандидат не найден' });
    }
    
    candidates[candidateIndex] = { ...candidates[candidateIndex], ...updates };
    
    res.json(candidates[candidateIndex]);
});

// ⚙️ Настройки
app.get('/api/settings', (req, res) => {
    console.log('⚙️ Запрос настроек');
    res.json(settings);
});

app.put('/api/settings', (req, res) => {
    console.log('⚙️ Обновление настроек:', req.body);
    
    settings = { ...settings, ...req.body };
    
    // TODO: Отправить в Telegram бот
    console.log('📤 Настройки отправлены в бот');
    
    res.json(settings);
});

// 📝 Скрипты
app.get('/api/scripts', (req, res) => {
    console.log('📝 Запрос скриптов');
    res.json(scripts);
});

app.put('/api/scripts', (req, res) => {
    console.log('📝 Обновление скриптов:', Object.keys(req.body));
    
    scripts = { ...scripts, ...req.body };
    
    // TODO: Отправить в Telegram бот  
    console.log('📤 Скрипты отправлены в бот');
    
    res.json(scripts);
});

// 💬 Диалог кандидата
app.get('/api/candidates/:id/dialogue', (req, res) => {
    const { id } = req.params;
    const candidate = candidates.find(c => String(c.id) === String(id));

    
    if (!candidate) {
        return res.status(404).json({ error: 'Кандидат не найден' });
    }
    
    console.log(`💬 Запрос диалога кандидата ${id}`);
    res.json(candidate.dialogue || []);
});

// ======================
// СТАТИЧЕСКИЕ ФАЙЛЫ В КОНЦЕ!
// ======================
app.use(express.static('public'));

// Главная страница 
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});
// 🔔 Telegram Webhook
// 🔔 Telegram Webhook (принимаем на Render и пересылаем на Railway)
app.post('/telegram-webhook', async (req, res) => {
    try {
        if (!TELEGRAM_WEBHOOK_FORWARD_URL) {
            console.error('TELEGRAM_WEBHOOK_FORWARD_URL is not set');
            return res.sendStatus(500);
        }

        // простая защита: проверяем секрет (мы его сами будем передавать при setWebhook)
        const secret = req.headers['x-telegram-bot-api-secret-token'];
        if (TELEGRAM_WEBHOOK_SECRET && secret !== TELEGRAM_WEBHOOK_SECRET) {
            console.warn('Invalid telegram secret token');
            return res.sendStatus(401);
        }

        await axios.post(TELEGRAM_WEBHOOK_FORWARD_URL, req.body, {
            headers: { 'Content-Type': 'application/json' },
            timeout: 8000
        });

        return res.sendStatus(200);
    } catch (err) {
        console.error('Telegram webhook forward error:', err.response?.data || err.message);
        return res.sendStatus(500);
    }
});


// Запуск сервера
app.listen(PORT, () => {
    console.log(`🌐 Dashboard запущен: http://localhost:${PORT}`);
    console.log(`📊 API доступен: http://localhost:${PORT}/api/stats`);
    console.log(`🤖 Готов к интеграции с Telegram ботом!`);
    console.log(`\n🔧 Структура API:`);
    console.log(`   GET  /api/stats - статистика`);
    console.log(`   GET  /api/candidates - список кандидатов`);
    console.log(`   POST /api/candidates - добавить кандидата`);
    console.log(`   PUT  /api/candidates/:id - обновить кандидата`);
    console.log(`   GET  /api/settings - настройки`);
    console.log(`   PUT  /api/settings - обновить настройки`);
    console.log(`   GET  /api/scripts - скрипты`);
    console.log(`   PUT  /api/scripts - обновить скрипты`);
});