'use strict';

/**
 * Tela de acesso negado.
 *
 * Exibe mensagem contextual sobre falta de permissão e oferece
 * um atalho de retorno compatível com o perfil autenticado.
 */

(function initAcessoNegado() {
  const descricaoEl = document.getElementById('acessoNegadoDescricao');
  const voltarEl = document.getElementById('acessoNegadoVoltar');

  const rotasPadraoPorPerfil = {
    admin: 'dashboard.html',
    gestor: 'dashboard.html',
    instrutor: 'sessoes.html',
    colaborador: 'sessoes.html',
  };

  function normalizarProximaRota(valor) {
    const texto = String(valor || '').trim();
    if (!texto) return '';
    if (!texto.startsWith('/pages/')) return '';
    if (texto.includes('..')) return '';
    return texto;
  }

  (async () => {
    const user = await window.Auth.requireAuth();
    if (!user) return;

    const params = new URLSearchParams(window.location.search || '');
    const next = normalizarProximaRota(params.get('next'));
    const destinoPadrao = rotasPadraoPorPerfil[user.perfil_acesso] || 'sessoes.html';

    if (descricaoEl && next) {
      descricaoEl.textContent = `Seu perfil (${user.perfil_acesso}) não possui permissão para acessar ${next}.`;
    }

    if (voltarEl) {
      voltarEl.href = destinoPadrao;
    }
  })();
})();
