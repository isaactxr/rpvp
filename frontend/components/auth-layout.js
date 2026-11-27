'use strict';

(function bootstrapAuthLayout() {
  const body = document.body;
  const contentRoot = document.querySelector('[data-layout-content]');

  if (!body || body.dataset.layout !== 'auth' || !contentRoot) {
    return;
  }

  const title = String(body.dataset.authTitle || '').trim();

  function escapeHtml(value) {
    return String(value || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  const shell = document.createElement('main');
  shell.className = 'login-shell';

  const card = document.createElement('section');
  card.className = 'login-card';
  card.innerHTML = `
    <div class="auth-toolbar"><button type="button" class="theme-toggle" data-theme-toggle aria-label="Modo escuro" aria-pressed="true">
          <svg class="theme-icon-dark" viewBox="0 0 24 24" aria-hidden="true"><path d="M20.5 14A8.5 8.5 0 0 1 10 3.5 8.5 8.5 0 1 0 20.5 14Z" /></svg>
          <svg class="theme-icon-light" viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="4" /><path d="M12 2v2m0 16v2M2 12h2m16 0h2M5 5l1.5 1.5m11 11L19 19M5 19l1.5-1.5m11-11L19 5" /></svg>
          <span data-theme-label>Escuro</span>
        </button></div>
    <img data-theme-logo src="../assets/img/${document.documentElement.dataset.theme === 'light' ? 'logo_dark.png' : 'logo.png'}" alt="Logo Viana Peixoto" class="logo" />
    <h1>${escapeHtml(title)}</h1>
  `;

  while (contentRoot.firstChild) {
    card.appendChild(contentRoot.firstChild);
  }

  shell.appendChild(card);
  contentRoot.replaceWith(shell);
})();
