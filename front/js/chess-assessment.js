(() => {
  const form = document.getElementById('chessAssessmentForm');
  if (!form) return;
  const storageKey = 'chessTrainer.chessAssessment.v1';
  const fields = [...form.querySelectorAll('select')];
  const progressFill = document.getElementById('assessmentProgressFill');
  const progressText = document.getElementById('assessmentProgressText');
  const result = document.getElementById('assessmentResult');
  const labels = {
    calculation: 'Расчёт вариантов', blunders: 'Контроль зевков',
    tactics: 'Тактическое зрение', time: 'Распределение времени',
    opening: 'Понимание дебютов', endgame: 'Техника эндшпиля',
    review: 'Разбор собственных партий'
  };
  const advice = {
    calculation: 'Перед каждым ходом кандидата называй 2–3 ответа соперника и проверяй форсированные продолжения.',
    blunders: 'Введи короткую проверку перед ходом: шахи, взятия, угрозы — сначала свои, затем соперника.',
    tactics: 'Решай тактические задачи без передвижения фигур и обязательно досчитывай вариант до спокойной позиции.',
    time: 'Сократи время на знакомые дебютные решения и оставляй запас на критические моменты партии.',
    opening: 'Изучай не только последовательность ходов, но и планы; отдельно тренируй ответы на отклонения соперника.',
    endgame: 'Повторяй базовые пешечные и ладейные окончания и играй их против бота из учебных позиций.',
    review: 'После партии сначала найди свои мысли и ошибки самостоятельно, а затем сверяй их с Stockfish.'
  };
  function updateProgress() {
    const count = fields.filter(field => field.value !== '').length;
    if (progressFill) progressFill.style.width = (count / fields.length * 100) + '%';
    if (progressText) progressText.textContent = count + ' из ' + fields.length + ' ответов';
  }
  function readAnswers() {
    return Object.fromEntries(fields.map(field => [field.name, field.value]));
  }
  function showResult(answers) {
    const weak = [];
    ['calculation','blunders','tactics','time','opening','endgame','review'].forEach(key => {
      const score = Number(answers[key]);
      const weakScore = key === 'blunders' || key === 'time' ? score : 3 - score;
      if (weakScore >= 2) weak.push({key, score: weakScore});
    });
    weak.sort((a,b) => b.score-a.score);
    const top = weak.slice(0,3);
    const ratingLabels = {under1000:'до 1000', '1000-1200':'1000–1200', '1200-1400':'1200–1400', '1400-1600':'1400–1600', '1600-1800':'1600–1800', '1800-2000':'1800–2000', '2000+':'выше 2000'};
    document.getElementById('assessmentResultTitle').textContent = 'Твой профиль: ' + ratingLabels[answers.rating] + ' Elo';
    document.getElementById('assessmentResultSummary').textContent =
      'Твоя цель — ' + answers.goal + ' Elo. По самооценке в первую очередь стоит поработать над ' +
      (top.length ? top.map(item => labels[item.key].toLowerCase()).join(', ') : 'поддержанием стабильной игры') +
      '. Это предварительная диагностика; точность можно повысить, если дополнительно разобрать реальные партии.';
    const priorities = document.getElementById('assessmentPriorities');
    priorities.replaceChildren();
    (top.length ? top : [{key:'review'}]).forEach((item,index) => {
      const card=document.createElement('article');
      card.className='assessment-priority';
      const number=document.createElement('span'); number.textContent=String(index+1).padStart(2,'0');
      const copy=document.createElement('div');
      const title=document.createElement('strong'); title.textContent=labels[item.key];
      const desc=document.createElement('p'); desc.textContent=advice[item.key];
      copy.append(title,desc); card.append(number,copy); priorities.append(card);
    });
    document.getElementById('assessmentTrainingTime').textContent = 'Твоё время на тренировку: ' + answers.training + ' мин в день';
    result.hidden = false;
    result.scrollIntoView({behavior:'smooth',block:'start'});
  }
  fields.forEach(field => field.addEventListener('change',updateProgress));
  form.addEventListener('submit',event => {
    event.preventDefault();
    if (!form.reportValidity()) return;
    const answers=readAnswers();
    try { localStorage.setItem(storageKey,JSON.stringify(answers)); } catch (_) {}
    showResult(answers);
  });
  document.getElementById('assessmentReset')?.addEventListener('click',() => {
    form.reset(); result.hidden=true; updateProgress();
    try { localStorage.removeItem(storageKey); } catch (_) {}
  });
  document.getElementById('assessmentEdit')?.addEventListener('click',() => {
    result.hidden=true; form.scrollIntoView({behavior:'smooth',block:'start'});
  });
  try {
    const saved=JSON.parse(localStorage.getItem(storageKey)||'null');
    if(saved && typeof saved==='object') {
      fields.forEach(field => { if (typeof saved[field.name]==='string') field.value=saved[field.name]; });
      updateProgress();
      if(fields.every(field=>field.value!=='')) showResult(saved);
    }
  } catch (_) {}
  updateProgress();
})();