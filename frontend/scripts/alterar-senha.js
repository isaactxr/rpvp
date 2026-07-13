'use strict';

/**
 * Controlador da tela de troca obrigatória de senha.
 *
 * Valida os campos no cliente e conclui o fluxo de primeiro acesso antes de permitir
 * o retorno para a tela originalmente solicitada.
 */
const formEl = document.getElementById('alterarSenhaForm');
const novaSenhaEl = document.getElementById('novaSenha');
const confirmarSenhaEl = document.getElementById('confirmarSenha');
const feedbackEl = document.getElementById('feedback');
const submitBtn = document.getElementById('submitBtn');

/**
 * Reaproveita a rota de retorno original, mantendo o fluxo seguro dentro da aplicação.
 * @returns {string} Caminho interno válido para redirecionamento após salvar a nova senha.
 */
function getRedirectTarget() {
  const query = new URLSearchParams(window.location.search);
  const nextRaw = query.get('next');
  if (!nextRaw) return '/pages/dashboard.html';

  const next = decodeURIComponent(nextRaw).trim();
  if (!next || /^https?:\/\//i.test(next) || next.startsWith('//')) {
    return '/pages/dashboard.html';
  }

  return next.startsWith('/') ? next : `/${next}`;
}

formEl?.addEventListener('submit', async (event) => {
  event.preventDefault();

  const novaSenha = String(novaSenhaEl?.value || '');
  const confirmarSenha = String(confirmarSenhaEl?.value || '');

  if (novaSenha.length < 6) {
    feedbackEl.textContent = 'A nova senha deve ter no mínimo 6 caracteres.';
    return;
  }

  if (novaSenha !== confirmarSenha) {
    feedbackEl.textContent = 'As senhas não conferem.';
    return;
  }

  submitBtn.disabled = true;
  feedbackEl.textContent = 'Salvando nova senha...';

  try {
    await window.Auth.apiJson('/auth/alterar-senha', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ novaSenha }),
    });

    await window.Auth.me();
    feedbackEl.textContent = 'Senha alterada com sucesso. Redirecionando...';
    window.location.href = getRedirectTarget();
  } catch (err) {
    feedbackEl.textContent = err.message;
  } finally {
    submitBtn.disabled = false;
  }
});

(async function init() {
  const user = await window.Auth.me();
  if (!user) {
    window.location.href = '/pages/login.html';
    return;
  }

  if (!window.Auth.precisaAlterarSenha(user)) {
    window.location.href = getRedirectTarget();
    return;
  }

  novaSenhaEl?.focus();
})();
