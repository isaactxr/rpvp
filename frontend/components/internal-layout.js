'use strict';

(function bootstrapInternalLayout() {
  const body = document.body;
  const contentRoot = document.querySelector('[data-layout-content]');

  if (!body || body.dataset.layout !== 'internal' || !contentRoot) {
    return;
  }

  const defaultNavItems = [
    { key: 'dashboard', href: 'dashboard.html', label: 'Dashboard', roles: 'admin,gestor,instrutor' },
    { key: 'sessoes', href: 'sessoes.html', label: 'Sessões', roles: 'admin,gestor,instrutor,colaborador' },
    { key: 'registros', href: 'registros.html', label: 'Auditoria de sessões', roles: 'admin,gestor' },
    { key: 'usuarios', href: 'usuarios.html', label: 'Usuários', roles: 'admin' },
    { key: 'configuracoes', href: 'configuracoes.html', label: 'Configurações', roles: 'admin' },
  ];

  const pageKey = String(body.dataset.navKey || '').trim();
  const pageTitle = String(body.dataset.pageTitle || '').trim();
  const pageSubtitle = String(body.dataset.pageSubtitle || '').trim();
  const pageClass = String(body.dataset.pageClass || '').trim();
  const titleId = String(body.dataset.pageTitleId || '').trim();
  const subtitleId = String(body.dataset.pageSubtitleId || '').trim();

  function escapeHtml(value) {
    return String(value || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function buildNavItems() {
    if (pageKey !== 'tipos-sessao') {
      return defaultNavItems;
    }

    const items = defaultNavItems.slice();
    items.splice(items.length - 1, 0, {
      key: 'tipos-sessao',
      href: 'tipos-sessao.html',
      label: 'Tipos de sessão',
      roles: 'admin',
    });
    return items;
  }

  function buildNavMarkup() {
    return buildNavItems().map((item) => {
      const activeClass = item.key === pageKey ? ' active' : '';
      return `<a href="${item.href}" class="sidebar-link${activeClass}" data-roles="${item.roles}">${escapeHtml(item.label)}</a>`;
    }).join('');
  }

  const pageSection = document.createElement('section');
  pageSection.className = `page${pageClass ? ` ${pageClass}` : ''}`;
  pageSection.innerHTML = `
    <header class="topbar">
      <div class="brand">
        <div>
          <h1${titleId ? ` id="${escapeHtml(titleId)}"` : ''}>${escapeHtml(pageTitle)}</h1>
          <p${subtitleId ? ` id="${escapeHtml(subtitleId)}"` : ''}>${escapeHtml(pageSubtitle)}</p>
        </div>
      </div>
      <div class="user-badge">
        <strong id="loggedUserName">-</strong>
        <span id="loggedUserRole">-</span>
        <button type="button" class="theme-toggle" data-theme-toggle aria-label="Modo escuro" aria-pressed="true">
          <svg class="theme-icon-dark" viewBox="0 0 24 24" aria-hidden="true"><path d="M20.5 14A8.5 8.5 0 0 1 10 3.5 8.5 8.5 0 1 0 20.5 14Z" /></svg>
          <svg class="theme-icon-light" viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="4" /><path d="M12 2v2m0 16v2M2 12h2m16 0h2M5 5l1.5 1.5m11 11L19 19M5 19l1.5-1.5m11-11L19 5" /></svg>
          <span data-theme-label>Escuro</span>
        </button>
        <button id="logoutBtn" class="ghost-btn" type="button">Sair</button>
      </div>
    </header>
  `;

  const footer = document.createElement('footer');
  footer.className = 'app-footer';
  footer.hidden = true;
  footer.setAttribute('aria-hidden', 'true');

  const shell = document.createElement('main');
  shell.className = 'layout';
  shell.innerHTML = `
    <aside class="sidebar card">
      <div class="sidebar-brand">
        <img src="../assets/img/logo.png" alt="Logo Viana Peixoto" class="sidebar-logo" />
      </div>
      ${buildNavMarkup()}
    </aside>
  `;

  while (contentRoot.firstChild) {
    pageSection.appendChild(contentRoot.firstChild);
  }

  pageSection.appendChild(footer);
  shell.appendChild(pageSection);
  contentRoot.replaceWith(shell);
})();