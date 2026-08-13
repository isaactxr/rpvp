'use strict';

/**
 * Controlador da tela de login.
 *
 * Responsável por autenticar o usuário, tratar o parâmetro `next` com segurança
 * e redirecionar para troca obrigatória de senha quando o backend indicar primeiro acesso.
 */
const form = document.getElementById('loginForm');
const usuarioEl = document.getElementById('usuario');
const senhaEl = document.getElementById('senha');
const feedbackEl = document.getElementById('feedback');
const submitBtn = document.getElementById('submitBtn');

/**
 * Sanitiza o parâmetro `next` para evitar redirecionamentos externos após o login.
 * @returns {string} Rota interna segura para navegação pós-autenticação.
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

form.addEventListener('submit', async (event) => {
  event.preventDefault();
  feedbackEl.textContent = 'Validando credenciais...';
  submitBtn.disabled = true;

  try {
    const sessao = await window.Auth.login(usuarioEl.value, senhaEl.value);
    feedbackEl.textContent = 'Login realizado com sucesso.';
    if (window.Auth.precisaAlterarSenha(sessao?.user)) {
      window.location.href = `/pages/alterar-senha.html?next=${encodeURIComponent(getRedirectTarget())}`;
      return;
    }
    window.location.href = getRedirectTarget();
  } catch (err) {
    feedbackEl.textContent = err.message;
  } finally {
    submitBtn.disabled = false;
  }
});

(async function init() {
  const user = await window.Auth.me();
  if (user) {
    if (window.Auth.precisaAlterarSenha(user)) {
      window.location.href = `/pages/alterar-senha.html?next=${encodeURIComponent(getRedirectTarget())}`;
      return;
    }
    window.location.href = getRedirectTarget();
  }
})();
