(() => {
  'use strict';

  fetch('/api/auth/me', {
    method: 'GET',
    credentials: 'same-origin',
    headers: { Accept: 'application/json' }
  }).then(async response => {
    if (response.status === 401) {
      window.location.replace('/');
      return;
    }
    if (!response.ok) {
      console.warn('Не удалось проверить аккаунт для этой страницы.');
      return;
    }
    const data = await response.json();
    if (!data.user || data.user.needs_setup) {
      window.location.replace('/');
    }
  }).catch(() => {
    console.warn('Не удалось подключиться к серверу авторизации.');
  });
})();