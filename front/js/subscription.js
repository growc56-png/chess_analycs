(() => {
  'use strict';

  const root = document.getElementById('tab-subscription');
  if (!root) return;

  const translations = {
    ru: {
      nav: 'Подписка',
      kicker: 'ТВОЙ СЛЕДУЮЩИЙ УРОВЕНЬ',
      title: 'Выбери свой путь к мастерству',
      intro: 'Больше точной аналитики, персональной работы над ошибками и системной подготовки.',
      language: 'Язык интерфейса',
      monthly: 'На месяц',
      yearly: 'На год · выгоднее',
      free: 'Free',
      premium: 'Premium',
      pro: 'Pro',
      freeDesc: 'Начни тренироваться и отслеживай прогресс.',
      premiumDesc: 'Главный выбор для регулярного роста.',
      proDesc: 'Максимум возможностей для серьёзной подготовки.',
      month: '/ месяц',
      year: '/ год',
      popular: 'ПОПУЛЯРНЫЙ ВЫБОР',
      freeFeatures: ['Базовый план тренировок', 'Основные шахматные инструменты', 'Сохранение прогресса'],
      premiumFeatures: ['Всё из Free', 'Расширенный анализ партий', 'Персональные тактические задания', 'Подробная статистика ошибок', 'Расширенный тренер и план занятий'],
      proFeatures: ['Всё из Premium', 'Глубокий анализ и отчёты', 'Расширенная работа над эндшпилями', 'Приоритетный доступ к новым функциям', 'Дополнительные тренировочные режимы'],
      current: 'Твой статус',
      active: 'Premium активен',
      expires: 'Действует до',
      noPremium: 'Сейчас у тебя бесплатный тариф',
      choose: 'Выбрать тариф',
      currentPlan: 'Текущий тариф',
      comingSoon: 'Оплата скоро появится',
      paymentNote: 'Цены показаны заранее. Онлайн-оплата ещё не подключена, поэтому покупка пока недоступна. Администратор может выдать Premium вручную.',
      currencyNote: 'Валюта зависит от выбранного языка: русский — ₽, English — $.',
      monthlyEquivalent: 'в пересчёте на месяц',
      freePrice: 'Бесплатно'
    },
    en: {
      nav: 'Subscription',
      kicker: 'YOUR NEXT LEVEL',
      title: 'Choose your path to mastery',
      intro: 'Get deeper analysis, focused work on mistakes, and a more structured training routine.',
      language: 'Interface language',
      monthly: 'Monthly',
      yearly: 'Yearly · best value',
      free: 'Free',
      premium: 'Premium',
      pro: 'Pro',
      freeDesc: 'Start training and track your progress.',
      premiumDesc: 'The best choice for consistent improvement.',
      proDesc: 'More tools for serious chess training.',
      month: '/ month',
      year: '/ year',
      popular: 'MOST POPULAR',
      freeFeatures: ['Basic training plan', 'Core chess tools', 'Progress tracking'],
      premiumFeatures: ['Everything in Free', 'Extended game analysis', 'Personal tactical exercises', 'Detailed mistake statistics', 'Advanced coach and training plan'],
      proFeatures: ['Everything in Premium', 'Deeper analysis and reports', 'Extended endgame training', 'Priority access to new features', 'Additional training modes'],
      current: 'Your status',
      active: 'Premium is active',
      expires: 'Valid until',
      noPremium: 'You are currently on the Free plan',
      choose: 'Choose plan',
      currentPlan: 'Current plan',
      comingSoon: 'Payments coming soon',
      paymentNote: 'These are planned launch prices. Online payments are not connected yet, so checkout is not available. An administrator can grant Premium manually.',
      currencyNote: 'Currency follows the selected language: Русский — ₽, English — $.',
      monthlyEquivalent: 'per month, billed yearly',
      freePrice: 'Free'
    }
  };

  const plans = {
    free: { ru: { month: 0, year: 0 }, en: { month: 0, year: 0 } },
    premium: { ru: { month: 399, year: 3290 }, en: { month: 5.99, year: 49.99 } },
    pro: { ru: { month: 699, year: 5490 }, en: { month: 9.99, year: 79.99 } }
  };

  let language = localStorage.getItem('chessTrainerLanguage') === 'en' ? 'en' : 'ru';
  let billing = 'month';

  const escapeHtml = value => String(value).replace(/[&<>"']/g, char => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  })[char]);

  function money(amount) {
    if (amount === 0) return translations[language].freePrice;
    return new Intl.NumberFormat(language === 'ru' ? 'ru-RU' : 'en-US', {
      style: 'currency',
      currency: language === 'ru' ? 'RUB' : 'USD',
      maximumFractionDigits: language === 'ru' ? 0 : 2
    }).format(amount);
  }

  function getStatus() {
    const user = window.getChessTrainerUser ? window.getChessTrainerUser() : null;
    const t = translations[language];
    if (!user) return t.noPremium;
    if (!user.is_premium) return t.noPremium;
    const expiry = user.premium_expires_at
      ? new Date(user.premium_expires_at).toLocaleDateString(language === 'ru' ? 'ru-RU' : 'en-US')
      : '';
    return t.active + (expiry ? ' · ' + t.expires + ': ' + expiry : '');
  }

  function render() {
    const t = translations[language];
    const status = getStatus();
    const user = window.getChessTrainerUser ? window.getChessTrainerUser() : null;
    const activePlan = user && user.is_premium ? 'premium' : 'free';
    document.documentElement.lang = language;
    const items = [
      { id: 'free', name: t.free, desc: t.freeDesc, features: t.freeFeatures },
      { id: 'premium', name: t.premium, desc: t.premiumDesc, features: t.premiumFeatures, popular: true },
      { id: 'pro', name: t.pro, desc: t.proDesc, features: t.proFeatures }
    ];

    root.innerHTML = `
      <div class="section-heading subscription-heading">
        <div><div class="section-kicker">${t.kicker}</div><h2>${t.title}</h2><p>${t.intro}</p></div>
        <label class="subscription-language"><span>${t.language}</span>
          <select id="subscriptionLanguage" aria-label="${t.language}">
            <option value="ru" ${language === 'ru' ? 'selected' : ''}>🇷🇺 Русский</option>
            <option value="en" ${language === 'en' ? 'selected' : ''}>🇬🇧 English</option>
          </select>
        </label>
      </div>
      <section class="subscription-status">
        <div><span>${t.current}</span><strong>${escapeHtml(status)}</strong></div>
        <div class="subscription-billing" role="group" aria-label="Billing period">
          <button type="button" data-billing="month" class="${billing === 'month' ? 'active' : ''}">${t.monthly}</button>
          <button type="button" data-billing="year" class="${billing === 'year' ? 'active' : ''}">${t.yearly}</button>
        </div>
      </section>
      <div class="subscription-plans">
        ${items.map(plan => {
          const amount = plans[plan.id][language][billing];
          const price = money(amount);
          const suffix = plan.id === 'free' ? '' : (billing === 'month' ? t.month : t.year);
          const isCurrent = plan.id === activePlan;
          const monthly = billing === 'year' && plan.id !== 'free'
            ? '<small>' + money(amount / 12) + ' ' + t.monthlyEquivalent + '</small>' : '';
          return `
            <article class="subscription-card ${plan.popular ? 'featured' : ''}">
              ${plan.popular ? '<div class="subscription-popular">' + t.popular + '</div>' : ''}
              <div class="subscription-plan-name">${plan.name}</div>
              <p class="subscription-plan-desc">${plan.desc}</p>
              <div class="subscription-price">${price}<span>${suffix}</span></div>
              ${monthly}
              <ul>${plan.features.map(feature => '<li><span>✓</span>' + feature + '</li>').join('')}</ul>
              <button type="button" class="subscription-choose" data-plan="${plan.id}" ${isCurrent ? 'disabled' : ''}>
                ${isCurrent ? t.currentPlan : t.choose}
              </button>
            </article>`;
        }).join('')}
      </div>
      <div class="subscription-note"><strong>${t.comingSoon}</strong><p>${t.paymentNote}</p><small>${t.currencyNote}</small></div>
    `;

    root.querySelector('#subscriptionLanguage').addEventListener('change', event => {
      language = event.target.value;
      localStorage.setItem('chessTrainerLanguage', language);
      const nav = document.querySelector('[data-tab="subscription"] span:last-child');
      if (nav) nav.textContent = translations[language].nav;
      render();
    });
    root.querySelectorAll('[data-billing]').forEach(button => button.addEventListener('click', () => {
      billing = button.dataset.billing;
      render();
    }));
    root.querySelectorAll('[data-plan]:not(:disabled)').forEach(button => button.addEventListener('click', () => {
      window.alert(t.paymentNote);
    }));
  }

  const nav = document.querySelector('[data-tab="subscription"] span:last-child');
  if (nav) nav.textContent = translations[language].nav;
  render();
  window.addEventListener('chess-auth-ready', () => {
    if (root.classList.contains('active')) render();
  });
})();