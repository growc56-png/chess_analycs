(() => {
  'use strict';

  const $ = id => document.getElementById(id);
  const TYPE_ROUTES = {
    tactics: { tab: 'errors', label: 'Открыть тактику' },
    endgame: { tab: 'endgames', label: 'Открыть эндшпили' },
    opening: { url: '/openings', label: 'Открыть дебюты' },
    strategy: { tab: 'analysis', label: 'Перейти к анализу' },
    game: { url: '/bots', label: 'Сыграть тренировочную партию' },
    review: { tab: 'coach', label: 'Открыть моего тренера' }
  };
  const TYPE_ICONS = {
    tactics: '⚡', endgame: '♜', opening: '♘', strategy: '♟',
    game: '♙', review: '✦', rest: '☕'
  };

  function make(tag, className, text) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
  }

  function openRoute(route) {
    if (route.url) {
      window.location.href = route.url;
      return;
    }
    const button = document.querySelector('.tab-btn[data-tab="' + route.tab + '"]');
    if (button) button.click();
  }

  function getMinutes(tasks) {
    return tasks.reduce((total, task) => {
      const parsed = Number(String(task.duration || '').match(/[\d.]+/)?.[0] || 0);
      return total + (Number.isFinite(parsed) ? parsed : 0);
    }, 0);
  }

  function render(snapshot) {
    const root = $('dailyTrainingDashboard');
    if (!root || !snapshot || !Array.isArray(snapshot.plan)) return;
    const plan = snapshot.plan;
    const day = plan.find(item => item.day === snapshot.currentDay)
      || plan.find(item => !item.completed)
      || plan[plan.length - 1];
    if (!day) {
      $('dailyTrainingTitle').textContent = 'План пока не создан';
      $('dailyTrainingSubtitle').textContent = 'Настрой цель по рейтингу, чтобы получить персональную программу.';
      $('dailyTrainingTasks').replaceChildren();
      $('dailyTrainingMinutes').textContent = '—';
      $('dailyTrainingProgressText').textContent = 'Нет активного плана';
      $('dailyTrainingProgressFill').style.width = '0%';
      $('dailyTrainingComplete').disabled = true;
      return;
    }

    const done = plan.filter(item => item.completed).length;
    const percent = plan.length ? Math.round(done / plan.length * 100) : 0;
    const goalLabel = snapshot.goal && snapshot.goal.current_elo && snapshot.goal.target_elo
      ? snapshot.goal.current_elo + ' → ' + snapshot.goal.target_elo + ' ELO'
      : 'Персональная цель';
    const targetLabel = document.querySelector('.target-card small');
    if (targetLabel) targetLabel.textContent = goalLabel;
    const tasks = Array.isArray(day.tasks) ? day.tasks : [];
    const minutes = getMinutes(tasks);
    const completed = Boolean(day.completed);
    $('dailyTrainingDate').textContent = new Date().toLocaleDateString('ru-RU', { weekday: 'long', day: 'numeric', month: 'long' });
    $('dailyTrainingTitle').textContent = completed ? 'Отличная работа — день завершён!' : 'Твоя тренировка на сегодня';
    $('dailyTrainingSubtitle').textContent = 'День ' + day.day + ' · Неделя ' + day.week + ' · ' + (day.phase || 'Персональный план');
    $('dailyTrainingMinutes').textContent = String(minutes || (snapshot.goal && snapshot.goal.daily_minutes) || '—');
    $('dailyTrainingProgressFill').style.width = percent + '%';
    $('dailyTrainingProgressText').textContent = done + ' из ' + plan.length + ' дней · ' + percent + '% общего плана';

    const list = $('dailyTrainingTasks');
    list.replaceChildren();
    if (!tasks.length) {
      list.appendChild(make('p', 'daily-coach-empty', 'На этот день пока нет отдельных заданий. Открой подробный план ниже.'));
    } else {
      tasks.forEach((task, index) => {
        const row = make('article', 'daily-coach-task');
        const icon = make('span', 'daily-coach-task-icon', TYPE_ICONS[task.type] || '♟');
        icon.setAttribute('aria-hidden', 'true');
        const body = make('div', 'daily-coach-task-copy');
        body.appendChild(make('strong', '', task.title || 'Задание ' + (index + 1)));
        body.appendChild(make('p', '', task.detail || 'Выполни задание из своего плана.'));
        const meta = make('span', 'daily-coach-task-meta', (task.duration ? task.duration + ' мин' : 'По плану') + (task.type === 'rest' ? ' · восстановление' : ''));
        body.appendChild(meta);
        row.append(icon, body);
        const route = TYPE_ROUTES[task.type];
        if (route) {
          const action = make('button', 'daily-coach-task-action', 'Открыть');
          action.type = 'button';
          action.addEventListener('click', () => openRoute(route));
          action.setAttribute('aria-label', route.label);
          row.appendChild(action);
        }
        list.appendChild(row);
      });
    }

    $('dailyTrainingComplete').disabled = completed;
    $('dailyTrainingComplete').textContent = completed ? 'День уже выполнен' : 'Отметить день выполненным';
    $('dailyTrainingHint').textContent = completed
      ? 'День сохранён в плане и дневнике активности.'
      : 'Отмечай завершённый день после реальной тренировки — это попадёт в дневник активности.';
    $('dailyTrainingStart').textContent = completed ? 'Посмотреть план' : 'Начать тренировку';
    $('dailyTrainingStart').onclick = () => {
      const planTab = document.querySelector('.tab-btn[data-tab="plan"]');
      if (planTab) planTab.click();
      $('dayView')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    };
    $('dailyTrainingComplete').onclick = () => {
      const checkbox = $('dayCheck');
      if (!checkbox || checkbox.disabled) return;
      checkbox.checked = true;
      checkbox.dispatchEvent(new Event('change', { bubbles: true }));
    };
  }

  function refresh() {
    if (typeof window.getChessTrainingSnapshot === 'function') render(window.getChessTrainingSnapshot());
  }

  window.addEventListener('chess-plan-updated', refresh);
  window.addEventListener('chess-auth-ready', refresh);
  window.addEventListener('load', refresh);
})();
