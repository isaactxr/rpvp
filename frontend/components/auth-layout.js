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
    <img src="../assets/img/logo.png" alt="Logo Viana Peixoto" class="logo" />
    <h1>${escapeHtml(title)}</h1>
  `;

  while (contentRoot.firstChild) {
    card.appendChild(contentRoot.firstChild);
  }

  shell.appendChild(card);
  contentRoot.replaceWith(shell);
})();