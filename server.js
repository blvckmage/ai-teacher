require('dotenv').config();
const express = require('express');
const fetch = require('node-fetch');
const cors = require('cors');
const path = require('path');

const app = express();
app.use(cors());
app.use(express.json());

// Подавать статические файлы (index.html, teacher.html, script.js, style.css)
app.use(express.static(path.join(__dirname)));

// Используем DeepSeek API
const DEEPSEEK_URL = 'https://api.deepseek.com/v1/chat/completions';

// Память чатов по предметам: массив сообщений {role, content}, последний 20 сообщений (10 пар)
const chats = {};

app.post('/api/ask', async (req, res) => {
  const { subject, question } = req.body;
  if (!question) return res.status(400).json({ error: 'Missing question' });

  // Инициализируем чат для предмета, если не существует
  if (!chats[subject]) {
    chats[subject] = [];
  }

  // Определяем язык вопроса: если есть буквы казахского алфавита, то казахский, иначе русский
  const kazakhLetters = /[\u04d8\u04d9\u04e8\u04e9\u04b0\u04b1\u0493\u0492\u04a2\u04a3\u04ae\u04af\u04ba\u04bb\u0456]/;
  const isKazakh = kazakhLetters.test(question);

  // Язык ответа: если вопрос на казахском, отвечаем на казахском, иначе на русском
  const answerLanguage = isKazakh ? 'in Kazakh' : 'in Russian';

  // Меняем описание предмета на соответствующем языке
  const subjectsRus = {
    math: { rus: 'математики', kaz: 'математика' },
    physics: { rus: 'физики', kaz: 'физика' },
    russian: { rus: 'русского языка', kaz: 'орыс тілі' },
    kazakh: { rus: 'казахского языка', kaz: 'қазақ тілі' },
    history: { rus: 'истории Казахстана', kaz: 'Қазақстан тарихы' }
  };
  const subjInfo = subjectsRus[subject] || { rus: '', kaz: '' };

  const subjectDesc = isKazakh ? subjInfo.kaz : subjInfo.rus;

  // Подготовка сообщений для чата
  const messages = chats[subject].slice(); // копия истории

  // Если новая сессия, добавляем системное сообщение
  if (messages.length === 0) {
    messages.push({
      role: 'system',
      content: `You are a helpful ${subjectDesc} teacher. Answer concisely ${answerLanguage}. Use Markdown for formatting and LaTeX for mathematical formulas: use $ ... $ for inline math expressions and $$ ... $$ for display equations. Format multiple equations on separate lines.`
    });
  }

  // Добавляем текущий вопрос пользователя
  messages.push({ role: 'user', content: question });

  // Локальная резервная функция-ответчик, если DeepSeek недоступен
  function localAnswer(subj, q) {
    const qq = (q || '').toLowerCase();
    if (subj === 'math') {
      if (qq.includes('производ') || qq.includes('производная')) return 'Производная — скорость изменения функции. Могу показать пример: d/dx x^2 = 2x.';
      if (qq.includes('интегр')) return 'Интеграл — это площадь под графиком. Пример: ∫ x dx = x^2/2 + C.';
      return 'Сформулируйте задачу точнее: пример, объяснение понятия или решение?' ;
    }
    if (subj === 'physics') {
      if (qq.includes('скорост') || qq.includes('ускорен')) return 'Скорость — изменение координаты по времени. Формула средней скорости v = Δx/Δt.';
      return 'Уточните тему: механика, электростатика или оптика?';
    }
    if (subj === 'russian') {
      if (qq.includes('орф') || qq.includes('правил')) return 'Напишите слово или предложение — разберём орфографию и правила.';
      return 'Могу помочь с грамматикой, разбором предложений и орфографией.';
    }
    if (subj === 'kazakh') return 'Казахский язык: напишите фразу или вопрос — помогу с грамматикой и переводом.';
    if (subj === 'history') return 'История Казахстана: уточните период или событие, и я дам краткое объяснение.';
    return 'Я могу помочь с учебными вопросами. Задайте вопрос конкретнее.';
  }

  try {
    const r = await fetch(DEEPSEEK_URL, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${process.env.DEEPSEEK_API_KEY}`,
        'Content-Type': 'application/json',
        'Accept': 'application/json'
      },
      body: JSON.stringify({
        model: 'deepseek-chat',
        messages: messages
      })
    });

    // Читаем ответ как текст — иногда сервер возвращает не-JSON (ошибки, HTML и т.п.)
    const raw = await r.text();

    if (!r.ok) {
      let errBody = raw;
      try { errBody = JSON.parse(raw); } catch (e) { /* оставляем текст */ }
      console.error('DeepSeek non-ok response:', r.status, r.statusText, errBody);
      // Возвращаем локальный ответ вместо 500, чтобы UI продолжал работать
      const fallback = localAnswer(subject, question);
      // Добавляем локальный ответ в историю
      chats[subject].push({ role: 'assistant', content: fallback });
      if (chats[subject].length > 21) {
        chats[subject] = chats[subject].slice(-21);
      }
      return res.json({ answer: fallback, fallback: true, error: `DeepSeek API error ${r.status} ${r.statusText}`, details: errBody });
    }

    // Попробуем распарсить JSON-ответ; если не удалось, используем сырой текст как ответ модели
    let data;
    try { data = JSON.parse(raw); } catch (e) { data = raw; }

    let answer = '';
    if (typeof data === 'string') {
      // Ответ — plain text
      answer = data;
    } else if (data.choices && data.choices[0]?.message?.content) {
      answer = data.choices[0].message.content;
    } else if (Array.isArray(data) && data[0]?.generated_text) {
      answer = data[0].generated_text;
    } else if (data.generated_text) {
      answer = data.generated_text;
    } else if (Array.isArray(data) && typeof data[0] === 'string') {
      answer = data[0];
    } else if (data.error) {
      console.error('DeepSeek returned error object:', data.error);
      const fallback = localAnswer(subject, question);
      // Добавляем локальный ответ в историю
      chats[subject].push({ role: 'assistant', content: fallback });
      if (chats[subject].length > 21) {
        chats[subject] = chats[subject].slice(-21);
      }
      return res.json({ answer: fallback, fallback: true, error: data.error });
    } else {
      answer = JSON.stringify(data);
    }

    // Добавляем ответ в историю
    chats[subject].push({ role: 'assistant', content: answer });
    if (chats[subject].length > 21) {
      chats[subject] = chats[subject].slice(-21);
    }

    return res.json({ answer });
  } catch (err) {
    console.error('Fetch error:', err);
    const fallback = localAnswer(subject, question);
    // Добавляем локальный ответ в историю
    chats[subject].push({ role: 'assistant', content: fallback });
    if (chats[subject].length > 21) {
      chats[subject] = chats[subject].slice(-21);
    }
    return res.json({ answer: fallback, fallback: true, error: err.message });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Proxy listening on http://localhost:${PORT}`));
