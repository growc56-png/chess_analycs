(() => {
  'use strict';

  fetch('/api/auth/me', {
    method: 'GET',
    credentials: 'same-origin',
    headers: { Accept: 'application/json' }
  }).then(response => {
    if (response.status === 401) {
      window.location.replace('/');
      return;
    }
    if (!response.ok) {
      console.warn('Не удалось проверить аккаунт для этой страницы.');
    }
  }).catch(() => {
    console.warn('Не удалось подключиться к серверу авторизации.');
  });
})();