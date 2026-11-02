(() => {
  'use strict';

  const $ = id => document.getElementById(id);
  let authResolved = false;
  let resolveAuth = null;
  let authPromise = null;
  let currentUser = null;
  let editingProfile = false;

  function setMessage(targetId, message, type) {
    const target = $(targetId);
    if (!target) return;
    target.textContent = message || '';
    target.className = 'auth-message' + (type ? ' ' + type : '');
  }

  function showGate(panel) {
    $('authGate').hidden = false;
    $('authPanel').hidden = panel !== 'auth';
    $('goalPanel').hidden = panel !== 'goal';
    document.body.classList.add('auth-locked');
  }

  function hideGate() {
    $('authGate').hidden = true;
    document.body.classList.remove('auth-locked');
    document.querySelector('.app-shell')?.classList.remove('auth-pending');
  }

  function setAccount(user) {
    currentUser = user || null;
    const actions = $('accountActions');
    const chip = $('accountChip');
    if (actions && chip && user) {
      actions.hidden = false;
      chip.textContent = user.username + ' · ' + (user.profile && user.profile.current_elo ? user.profile.current_elo + ' Elo' : 'аккаунт');
    } else if (actions) {
      actions.hidden = true;
    }
  }

  function finishAuth(allowed) {
    if (authResolved) return;
    authResolved = true;
    hideGate();
    setAccount(currentUser);
    if (allowed) {
      window.__chessAuthReady = true;
      window.dispatchEvent(new Event('chess-auth-ready'));
    }
    if (resolveAuth) resolveAuth(Boolean(allowed));
  }

  async function readCurrentUser() {
    const response = await fetch('/api/auth/me', {
      method: 'GET',
      credentials: 'same-origin',
      headers: { Accept: 'application/json' }
    });
    if (!response.ok) return null;
    const data = await response.json();
    return data.user || null;
  }

  async function parseResponse(response) {
    let data = {};
    try {
      data = await response.json();
    } catch (error) {
      throw new Error('Сервер вернул некорректный ответ.');
    }
    if (!response.ok) {
      throw new Error(data.detail || 'Не удалось выполнить запрос.');
    }
    return data;
  }

  function showGoalForm(user, editing) {
    editingProfile = Boolean(editing);
    $('goalCurrentElo').value = user && user.profile && user.profile.current_elo
      ? user.profile.current_elo
      : 800;
    $('goalTargetElo').value = user && user.profile && user.profile.target_elo
      ? user.profile.target_elo
      : Math.max(800, Math.min(2000, Number($('goalCurrentElo').value) + 400));
    $('goalDays').value = user && user.profile && user.profile.goal_days
      ? String(user.profile.goal_days)
      : '120';
    $('goalDailyMinutes').value = user && user.profile && user.profile.daily_minutes
      ? String(user.profile.daily_minutes)
      : '90';
    $('goalCancelBtn').hidden = !editing;
    setMessage('goalMessage', '', '');
    showGate('goal');
  }

  async function continueWithUser(user) {
    currentUser = user;
    if (user && user.needs_setup) {
      showGoalForm(user, false);
      return;
    }
    finishAuth(true);
  }

  async function submitAuth(endpoint, body) {
    const response = await fetch(endpoint, {
      method: 'POST',
      credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify(body)
    });
    const data = await parseResponse(response);
    await continueWithUser(data.user);
  }

  async function submitGoal(event) {
    event.preventDefault();
    const currentElo = Number($('goalCurrentElo').value);
    const targetElo = Number($('goalTargetElo').value);
    const goalDays = Number($('goalDays').value);
    const dailyMinutes = Number($('goalDailyMinutes').value);

    if (!Number.isInteger(currentElo) || currentElo < 800 || currentElo > 2000) {
      setMessage('goalMessage', 'Текущий рейтинг должен быть от 800 до 2000 Elo.', 'error');
      return;
    }
    if (!Number.isInteger(targetElo) || targetElo < currentElo || targetElo > 2000) {
      setMessage('goalMessage', 'Целевой рейтинг должен быть не ниже текущего и не выше 2000 Elo.', 'error');
      return;
    }
    if (!Number.isInteger(goalDays) || goalDays < 7 || goalDays > 1095) {
      setMessage('goalMessage', 'Выбери срок от 7 дней до 3 лет.', 'error');
      return;
    }
    if (!Number.isInteger(dailyMinutes) || dailyMinutes < 30 || dailyMinutes > 480) {
      setMessage('goalMessage', 'Время тренировки должно быть от 30 минут до 8 часов.', 'error');
      return;
    }

    $('goalSaveBtn').disabled = true;
    setMessage('goalMessage', 'Составляю персональный план…', '');
    try {
      const response = await fetch('/api/profile', {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({
          current_elo: currentElo,
          target_elo: targetElo,
          goal_days: goalDays,
          daily_minutes: dailyMinutes
        })
      });
      const data = await parseResponse(response);
      currentUser = data.user;
      if (editingProfile) {
        editingProfile = false;
        hideGate();
        setAccount(currentUser);
        window.location.reload();
      } else {
        finishAuth(true);
      }
    } catch (error) {
      setMessage('goalMessage', error.message, 'error');
    } finally {
      $('goalSaveBtn').disabled = false;
    }
  }

  function bindEvents() {
    document.querySelector('.app-shell')?.classList.add('auth-pending');
    $('authLoginTab').addEventListener('click', () => {
      $('authLoginTab').classList.add('active');
      $('authRegisterTab').classList.remove('active');
      $('authLoginForm').hidden = false;
      $('authRegisterForm').hidden = true;
      $('authTitle').textContent = 'Войди в Chess Trainer';
      setMessage('authMessage', '', '');
    });

    $('authRegisterTab').addEventListener('click', () => {
      $('authRegisterTab').classList.add('active');
      $('authLoginTab').classList.remove('active');
      $('authLoginForm').hidden = true;
      $('authRegisterForm').hidden = false;
      $('authTitle').textContent = 'Создай свой аккаунт';
      setMessage('authMessage', 'Ник: 3–24 символа. Пароль: минимум 10 символов.', '');
    });

    $('authLoginForm').addEventListener('submit', async event => {
      event.preventDefault();
      const button = $('authLoginForm').querySelector('button[type="submit"]');
      button.disabled = true;
      setMessage('authMessage', 'Проверяю данные…', '');
      try {
        await submitAuth('/api/auth/login', {
          email: $('authLoginEmail').value.trim(),
          password: $('authLoginPassword').value
        });
      } catch (error) {
        setMessage('authMessage', error.message, 'error');
      } finally {
        button.disabled = false;
      }
    });

    $('authRegisterForm').addEventListener('submit', async event => {
      event.preventDefault();
      const button = $('authRegisterForm').querySelector('button[type="submit"]');
      button.disabled = true;
      setMessage('authMessage', 'Создаю аккаунт…', '');
      try {
        await submitAuth('/api/auth/register', {
          username: $('authRegisterUsername').value.trim(),
          email: $('authRegisterEmail').value.trim(),
          password: $('authRegisterPassword').value
        });
      } catch (error) {
        setMessage('authMessage', error.message, 'error');
      } finally {
        button.disabled = false;
      }
    });

    $('goalSetupForm').addEventListener('submit', submitGoal);
    $('goalCancelBtn').addEventListener('click', () => {
      if (!editingProfile) return;
      editingProfile = false;
      hideGate();
      setAccount(currentUser);
    });

    $('accountEditGoalBtn').addEventListener('click', () => {
      if (!currentUser) return;
      showGoalForm(currentUser, true);
    });

    $('accountLogoutBtn').addEventListener('click', async () => {
      $('accountLogoutBtn').disabled = true;
      try {
        await fetch('/api/auth/logout', {
          method: 'POST',
          credentials: 'same-origin'
        });
      } finally {
        window.location.reload();
      }
    });
  }

  async function requireChessAuth() {
    if (authPromise) return authPromise;
    authPromise = new Promise(async resolve => {
      resolveAuth = resolve;
      try {
        const user = await readCurrentUser();
        if (user) {
          currentUser = user;
          await continueWithUser(user);
        } else {
          currentUser = null;
          setAccount(null);
          showGate('auth');
        }
      } catch (error) {
        showGate('auth');
        setMessage('authMessage', 'Не удалось проверить вход. Проверь соединение с сервером и попробуй снова.', 'error');
      }
    });
    return authPromise;
  }

  window.requireChessAuth = requireChessAuth;
  window.getChessTrainerUser = () => currentUser;
  bindEvents();
})();