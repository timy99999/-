export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  const token = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = process.env.TELEGRAM_CHAT_ID;
  if (!token || !chatId) {
    res.status(500).json({ error: 'Bot not configured' });
    return;
  }

  let body = req.body;
  if (typeof body === 'string') {
    try { body = JSON.parse(body); } catch { body = {}; }
  }
  body = body || {};

  const clean = (v, max) => String(v == null ? '' : v).slice(0, max);
  const name = clean(body.name, 100).trim();
  const phone = clean(body.phone, 40).trim();
  const delivery = clean(body.delivery, 60).trim();
  const comment = clean(body.comment, 400).trim() || '—';
  const items = Array.isArray(body.items) ? body.items.slice(0, 30).map(i => clean(i, 200)) : [];
  const total = clean(body.total, 20);

  if (!name || !phone || !delivery || items.length === 0) {
    res.status(400).json({ error: 'Missing fields' });
    return;
  }

  const text = [
    '\u{1F96F} Новый заказ — Самсы на заказ',
    '',
    ...items.map(i => '• ' + i),
    'Итого: ' + total + ' сом',
    '',
    'Имя: ' + name,
    'Телефон: ' + phone,
    'Способ доставки: ' + delivery,
    'Комментарий: ' + comment
  ].join('\n');

  try {
    const tgRes = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: chatId, text })
    });
    const data = await tgRes.json();
    if (!data.ok) {
      res.status(502).json({ error: 'Telegram error', detail: data.description });
      return;
    }
    res.status(200).json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: 'Send failed' });
  }
}
