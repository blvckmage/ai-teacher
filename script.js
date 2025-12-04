// Логика навигации с главной страницы на страницу учителя
function selectSubject(id) {
  // Перенаправляем с параметром subject
  window.location.href = `teacher.html?subject=${encodeURIComponent(id)}`;
}

// Парсим query-параметры
function getQueryParam(name) {
  const urlParams = new URLSearchParams(window.location.search);
  return urlParams.get(name);
}

// Добавляет сообщение в чат
function addMessage(role, text) {
  const chat = document.getElementById('chat');
  const msg = document.createElement('div');
  msg.className = `message ${role}`;
  // Рендерим markdown для ответов учителя
  if (role === 'teacher') {
    msg.innerHTML = marked.parse(text);
    // Рендерим формулы LaTeX если MathJax загружен
    if (window.MathJax && MathJax.typeset) {
      MathJax.typesetPromise([msg]).catch(err => console.error('MathJax error:', err));
    }
  } else {
    msg.textContent = text;
  }
  chat.appendChild(msg);
  chat.scrollTop = chat.scrollHeight;
}

// Простая локальная эмуляция ИИ-ответа (броский, но рабочий пример на клиенте)
function generateLocalAnswer(subject, question) {
  const q = question.toLowerCase();
  if (subject === 'math') {
    if (q.includes('производ') || q.includes('производная')) return 'Производная — это скорость изменения функции. Хотите пример с конкретной функцией?';
    if (q.includes('интегр')) return 'Интеграл — это площадь под графиком. Могу показать решение простого интеграла.';
    return 'Для математики попробуйте уточнить: хотите пример, решение задачи или объяснение понятия?';
  }
  if (subject === 'physics') {
    if (q.includes('скорост') || q.includes('ускорен')) return 'Скорость — это изменение координаты по времени. Нужен пример с формулами?';
    return 'Физика: уточните тему (классическая механика, электростатика, термодинамика и т.д.)';
  }
  if (subject === 'russian') {
    if (q.includes('орфограф') || q.includes('правил')) return 'Правописание часто зависит от корня и приставок. Пришлите слово — разберём.';
    return 'Русский язык: могу помочь с грамматикой, орфографией и разбором предложений.';
  }
  if (subject === 'kazakh') {
    return 'Казахский язык: напишите фразу или вопрос — помогу с грамматикой и переводом.';
  }
  if (subject === 'history') {
    return 'История Казахстана: уточните период или событие, и я дам краткое объяснение.';
  }
  return 'Я могу помочь с учебными вопросами. Задайте вопрос конкретнее.';
}

// Основная логика страницы teacher.html
function initTeacherPage() {
  const subject = getQueryParam('subject') || 'math';

  const subjects = {
    math: { name: 'Учитель математики', color: '#1e88e5', intro: 'Помогу с алгеброй, геометрией и анализом.' },
    physics: { name: 'Учитель физики', color: '#43a047', intro: 'Помогу с механикой, электричеством и оптикой.' },
    russian: { name: 'Учитель русского', color: '#6a1b9a', intro: 'Грамматика, орфография, разбор предложений.' },
    kazakh: { name: 'Учитель казахского', color: '#fb8c00', intro: 'Грамматика, лексика и перевод.' },
    history: { name: 'Учитель истории', color: '#8e24aa', intro: 'История Казахстана: события, даты, контекст.' }
  };

  const info = subjects[subject] || { name: 'Учитель', color: '#333', intro: '' };
  document.getElementById('teacher-name').textContent = info.name;
  document.getElementById('teacher-intro').textContent = info.intro;
  document.documentElement.style.setProperty('--accent', info.color);

  // Обработка формы
  const form = document.getElementById('ask-form');
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const input = document.getElementById('question');
    const question = input.value.trim();
    if (!question) return;
    addMessage('user', question);
    input.value = '';
    addMessage('system', '... думает ...');

    try {
      const res = await fetch('/api/ask', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ subject, question })
      });

      const data = await res.json();
      const chat = document.getElementById('chat');
      const last = chat.querySelector('.message.system:last-child');
      if (last) last.remove();

      if (res.ok) {
        const answer = data.answer || 'Нет ответа от сервера.';
        addMessage('teacher', answer);
      } else {
        addMessage('teacher', 'Ошибка сервера: ' + (data.error || res.status));
      }
    } catch (err) {
      const chat = document.getElementById('chat');
      const last = chat.querySelector('.message.system:last-child');
      if (last) last.remove();
      addMessage('teacher', 'Ошибка сети: ' + err.message);
    }
  });
}

// Автоинициализация на странице teacher.html
document.addEventListener('DOMContentLoaded', () => {
  if (window.location.pathname.endsWith('teacher.html')) {
    initTeacherPage();
  }
});
