import express from 'express';
import fetch from 'node-fetch';

const router = express.Router();

const TELEGRAM_TOKEN = process.env.TG_BOT_TOKEN;
const DINARA_ID = process.env.DINARA_TELEGRAM_ID;
const OWNER_ID = process.env.OWNER_TELEGRAM_ID;

router.post('/netlify/test-completed', async (req, res) => {
    try {
        const data = req.body;

        const name = data.name || '—';
        const phone = data.phone || '—';
        const telegramId = data.telegram_id || '—';
        const score = data.total_score || '—';

        const message =
`✅ ТЕСТ ПРОЙДЕН

👤 Имя: ${name}
📞 Телефон: ${phone}
🆔 Telegram ID: ${telegramId}

📊 Итоговый результат: ${score}%

Рекомендуется связаться с кандидатом и разобрать результат.`;

        const send = async (chatId) => {
            await fetch(`https://api.telegram.org/bot${TELEGRAM_TOKEN}/sendMessage`, {
                method: 'POST',
                headers: {'Content-Type': 'application/json'},
                body: JSON.stringify({
                    chat_id: chatId,
                    text: message
                })
            });
        };

        await send(DINARA_ID);
        await send(OWNER_ID);

        res.status(200).json({ ok: true });
    } catch (e) {
        console.error('Webhook error:', e);
        res.status(500).json({ ok: false });
    }
});

export default router;
