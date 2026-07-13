'use strict';

/**
 * Módulo utilitário de autenticação do frontend.
 *
 * Centraliza a resolução da URL base da API, a persistência da sessão em `localStorage`,
 * a renovação de dados do usuário autenticado e os redirecionamentos obrigatórios de login
 * e troca de senha no primeiro acesso.
 */
(function bootstrapAuth(global) {
  const API_BASE_STORAGE_KEY = 'laboral_api_base_v1';
  const STORAGE_KEY = 'laboral_auth_v1';

  /**
   * Normaliza a URL base da API removendo espaços e barras finais redundantes.
   * @param {string} valor URL informada via `window` ou `localStorage`.
   * @returns {string} URL pronta para compor os endpoints do backend.
   */
  function normalizarApiBase(valor) {
    return String(valor || '').trim().replace(/\/+$/, '');
  }

  function normalizarApiBaseSegura(valor) {
    const base = normalizarApiBase(valor);
    if (!base) return '';
    if (/^https?:\/\//i.test(base)) {
      return '';
    }
    return base.startsWith('/') ? base : `/${base}`;
  }

  /**
   * Resolve a origem do backend usando a seguinte ordem: override global, storage local e fallback do host atual.
   * @returns {string} Base URL efetiva da API.
   */
  function resolverApiBase() {
    const sobrescritoWindow = normalizarApiBaseSegura(global.__LABORAL_API_BASE__);
    if (sobrescritoWindow) return sobrescritoWindow;

    try {
      const sobrescritoStorage = normalizarApiBaseSegura(localStorage.getItem(API_BASE_STORAGE_KEY));
      if (sobrescritoStorage) return sobrescritoStorage;
    } catch (_err) {
      // ignora indisponibilidade de storage
    }

    return '/api';
  }

  const API_BASE = resolverApiBase();

  function montarUrlViaProxy(pathnameComQuery) {
    const sufixo = String(pathnameComQuery || '').trim();
    if (!sufixo) return `${API_BASE}/`;

    const normalizado = sufixo.startsWith('/') ? sufixo : `/${sufixo}`;
    if (normalizado === API_BASE || normalizado.startsWith(`${API_BASE}/`)) {
      return normalizado;
    }

    return `${API_BASE}${normalizado}`;
  }

  function normalizarUrlApi(urlOuPath) {
    const valor = String(urlOuPath || '').trim();
    if (!valor) return `${API_BASE}/`;

    if (/^https?:\/\//i.test(valor)) {
      try {
        const absolute = new URL(valor);
        return montarUrlViaProxy(`${absolute.pathname}${absolute.search}`);
      } catch (_err) {
        return montarUrlViaProxy(valor);
      }
    }

    return montarUrlViaProxy(valor);
  }

  /**
   * Lê a sessão persistida no navegador e garante a estrutura mínima esperada.
   * @returns {{token: string, user: object, expiraEm: number}|null} Sessão válida ou `null`.
   */
  function carregarSessao() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return null;
      const parsed = JSON.parse(raw);
      if (!parsed?.token || !parsed?.user) return null;
      return parsed;
    } catch (_err) {
      return null;
    }
  }

  function salvarSessao(sessao) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(sessao));
  }

  function limparSessao() {
    localStorage.removeItem(STORAGE_KEY);
  }

  function getToken() {
    return carregarSessao()?.token || null;
  }

  function getUser() {
    return carregarSessao()?.user || null;
  }

  /**
   * Monta a rota de login preservando a página de retorno quando o usuário perde a sessão.
   * @returns {string} Caminho relativo para `login.html` com query `next` quando aplicável.
   */
  function rotaLoginComRetorno() {
    const pathname = window.location.pathname || '/pages/sessoes.html';
    if (pathname.endsWith('/pages/login.html')) return '/pages/login.html';

    const retorno = `${pathname}${window.location.search || ''}`;
    return `/pages/login.html?next=${encodeURIComponent(retorno)}`;
  }

  function precisaAlterarSenha(user) {
    return Boolean(user?.reset_senha_primeiro_acesso);
  }

  function rotaAlterarSenhaComRetorno() {
    const pathname = window.location.pathname || '/pages/sessoes.html';
    if (pathname.endsWith('/pages/alterar-senha.html')) {
      return '/pages/alterar-senha.html';
    }

    const retorno = `${pathname}${window.location.search || ''}`;
    return `/pages/alterar-senha.html?next=${encodeURIComponent(retorno)}`;
  }

  function redirecionarLogin() {
    window.location.href = rotaLoginComRetorno();
  }

  function redirecionarAlterarSenha() {
    window.location.href = rotaAlterarSenhaComRetorno();
  }

  function rotaAcessoNegadoComRetorno() {
    const pathname = window.location.pathname || '/pages/sessoes.html';
    const retorno = `${pathname}${window.location.search || ''}`;
    return `/pages/acesso-negado.html?next=${encodeURIComponent(retorno)}`;
  }

  function redirecionarAcessoNegado() {
    window.location.href = rotaAcessoNegadoComRetorno();
  }

  function filtrarNavPorPerfil(perfil) {
    document.querySelectorAll('.role-nav-item[data-roles]').forEach((el) => {
      const roles = String(el.dataset.roles || '').split(',').map((r) => r.trim());
      el.classList.toggle('hidden', !roles.includes(perfil));
    });
  }

  function preencherUsuarioUI() {
    const user = getUser();
    const nomeEl = document.getElementById('loggedUserName');
    const roleEl = document.getElementById('loggedUserRole');

    if (nomeEl) {
      nomeEl.textContent = user?.nome_completo || 'Usuário não autenticado';
    }

    if (roleEl) {
      roleEl.textContent = user?.perfil_acesso || '-';
    }
  }

  function bindLogoutButton() {
    const btn = document.getElementById('logoutBtn');
    if (!btn) return;
    if (btn.dataset.authLogoutBound === 'true') return;
    btn.dataset.authLogoutBound = 'true';

    btn.addEventListener('click', async () => {
      await logout();
    });
  }

  async function login(usuario, senha) {
    const response = await fetch(`${API_BASE}/auth/login`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ usuario, senha }),
    });

    const json = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error(json?.message || 'Falha ao realizar login.');
    }

    const sessao = {
      token: json.token,
      user: json.usuario,
      expiraEm: json.expiraEm,
    };

    salvarSessao(sessao);
    return sessao;
  }

  async function me() {
    const token = getToken();
    if (!token) return null;

    const response = await fetch(`${API_BASE}/auth/me`, {
      headers: { Authorization: `Bearer ${token}` },
    });

    if (!response.ok) {
      limparSessao();
      return null;
    }

    const json = await response.json().catch(() => ({}));
    if (!json?.user) return null;

    salvarSessao({
      token,
      user: json.user,
      expiraEm: json.expiraEm,
    });

    return json.user;
  }

  /**
   * Encerra a sessão atual no backend e limpa o estado local do navegador.
   * @param {{redirect?: boolean}} [options]
   * @returns {Promise<void>}
   */
  async function logout(options = {}) {
    const redirect = options.redirect !== false;

    try {
      const token = getToken();
      if (token) {
        await fetch(`${API_BASE}/auth/logout`, {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${token}`,
          },
        });
      }
    } catch (_err) {
      // ignora erro de rede durante logout local
    } finally {
      limparSessao();
      if (redirect) {
        redirecionarLogin();
      }
    }
  }

  /**
   * Executa uma requisição autenticada ao backend e força novo login quando recebe 401.
   * @param {string} url Endpoint absoluto.
   * @param {RequestInit} [options={}] Opções adicionais do `fetch`.
   * @returns {Promise<Response>} Resposta bruta do navegador para cenários que precisam de blob ou stream.
   */
  async function authFetch(url, options = {}) {
    const token = getToken();
    if (!token) {
      redirecionarLogin();
      throw new Error('Sessão expirada.');
    }

    const headers = {
      ...(options.headers || {}),
      Authorization: `Bearer ${token}`,
    };

    const response = await fetch(normalizarUrlApi(url), {
      ...options,
      headers,
    });

    if (response.status === 401) {
      limparSessao();
      redirecionarLogin();
      throw new Error('Sessão expirada. Faça login novamente.');
    }

    return response;
  }

  /**
   * Atalho para consumir endpoints JSON já autenticados, padronizando tratamento de erro e redirect por troca obrigatória de senha.
   * @param {string} path Caminho relativo ou URL absoluta.
   * @param {RequestInit} [options={}] Configuração opcional da chamada.
   * @returns {Promise<any>} Corpo JSON parseado quando a resposta é bem-sucedida.
   */
  async function apiJson(path, options = {}) {
    const url = normalizarUrlApi(path);
    const response = await authFetch(url, options);
    const json = await response.json().catch(() => ({}));

    if (!response.ok) {
      if (response.status === 403 && json?.code === 'PASSWORD_CHANGE_REQUIRED') {
        redirecionarAlterarSenha();
      }
      throw new Error(json?.message || `Erro HTTP ${response.status}`);
    }

    return json;
  }

  /**
   * Garante que exista um usuário autenticado e autorizado para a tela atual.
   * @param {string[]} [perfisPermitidos] Lista opcional de perfis aceitos pela página.
   * @returns {Promise<object|null>} Usuário autenticado ou `null` quando houve redirecionamento.
   */
  async function requireAuth(perfisPermitidos) {
    const user = await me();
    if (!user) {
      redirecionarLogin();
      return null;
    }

    const emTelaAlterarSenha = (window.location.pathname || '').endsWith('/pages/alterar-senha.html');
    if (precisaAlterarSenha(user) && !emTelaAlterarSenha) {
      redirecionarAlterarSenha();
      return null;
    }

    if (!precisaAlterarSenha(user) && emTelaAlterarSenha) {
      window.location.href = '/pages/dashboard.html';
      return null;
    }

    if (Array.isArray(perfisPermitidos) && perfisPermitidos.length > 0) {
      if (!perfisPermitidos.includes(user.perfil_acesso)) {
        redirecionarAcessoNegado();
        return null;
      }
    }

    preencherUsuarioUI();
    bindLogoutButton();
    filtrarNavPorPerfil(user.perfil_acesso);
    return user;
  }

  function getApiBase() {
    return API_BASE;
  }

  function setApiBase(novoApiBase) {
    const normalizado = normalizarApiBaseSegura(novoApiBase);
    if (!normalizado) return;
    localStorage.setItem(API_BASE_STORAGE_KEY, normalizado);
  }

  global.Auth = {
    API_BASE,
    getApiBase,
    setApiBase,
    getUser,
    getToken,
    login,
    logout,
    me,
    requireAuth,
    apiJson,
    authFetch,
    precisaAlterarSenha,
    limparSessao,
  };
})(window);
