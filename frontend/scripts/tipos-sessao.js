'use strict';

/**
 * Cadastro isolado de tipos de sessão.
 *
 * Disponibiliza CRUD simples para o catálogo usado pelo restante do sistema na criação
 * e filtragem de sessões.
 */

// ─── DOM ─────────────────────────────────────────────────────────────────────

const tipoForm    = document.getElementById('tipoForm');
const tipoNomeEl  = document.getElementById('tipoNome');
const tipoStatusEl = document.getElementById('tipoStatus');
const tiposBodyEl  = document.getElementById('tiposBody');
const refreshBtn   = document.getElementById('refreshBtn');

const editModal    = document.getElementById('editModal');
const editForm     = document.getElementById('editForm');
const editIdEl     = document.getElementById('editId');
const editNomeEl   = document.getElementById('editNome');
const editAtivoEl  = document.getElementById('editAtivo');
const editStatusEl = document.getElementById('editStatus');
const cancelEditBtn = document.getElementById('cancelEditBtn');

// ─── Estado ───────────────────────────────────────────────────────────────────

const APP_TIMEZONE = 'America/Sao_Paulo';
const state = { tipos: [] };

// ─── Helpers ─────────────────────────────────────────────────────────────────

function setStatus(el, msg, estilo = '') {
  if (!el) return;
  el.textContent = msg;
  el.style.color = estilo === 'erro' ? '#f87171' : estilo === 'ok' ? '#22c55e' : '';
}

function formatarData(valor) {
  if (!valor) return '-';
  const dt = new Date(valor);
  return Number.isNaN(dt.getTime()) ? String(valor) : dt.toLocaleDateString('pt-BR', { timeZone: APP_TIMEZONE });
}

// ─── Render ───────────────────────────────────────────────────────────────────

function renderTipos() {
  if (!tiposBodyEl) return;

  if (state.tipos.length === 0) {
    tiposBodyEl.innerHTML = '<tr><td colspan="4" class="empty">Nenhum tipo cadastrado.</td></tr>';
    return;
  }

  tiposBodyEl.innerHTML = '';
  for (const tipo of state.tipos) {
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>${tipo.nome}</td>
      <td>
        <span class="${tipo.ativo ? 'pill pill-ok' : 'pill'}">
          ${tipo.ativo ? 'Ativo' : 'Inativo'}
        </span>
      </td>
      <td class="mono">${formatarData(tipo.criado_em)}</td>
      <td>
        <div style="display:flex;gap:0.5rem;flex-wrap:wrap;">
          <button
            class="ghost-btn"
            style="padding:0.3rem 0.75rem;font-size:0.8rem;"
            data-action="editar"
            data-id="${tipo.id}"
          >Editar</button>
          <button
            class="${tipo.ativo ? 'danger-soft-btn' : 'success-soft-btn'}"
            style="padding:0.3rem 0.75rem;font-size:0.8rem;"
            data-action="toggle"
            data-id="${tipo.id}"
            data-ativo="${tipo.ativo}"
          >${tipo.ativo ? 'Desativar' : 'Ativar'}</button>
          <button
            class="danger-soft-btn"
            style="padding:0.3rem 0.75rem;font-size:0.8rem;"
            data-action="deletar"
            data-id="${tipo.id}"
            data-nome="${tipo.nome}"
          >Remover</button>
        </div>
      </td>
    `;
    tiposBodyEl.appendChild(tr);
  }
}

// ─── Carrega tipos ────────────────────────────────────────────────────────────

async function carregarTipos() {
  try {
    const json = await window.Auth.apiJson('/tipos-sessao');
    state.tipos = Array.isArray(json?.data) ? json.data : [];
    renderTipos();
  } catch (err) {
    setStatus(tipoStatusEl, `Erro ao carregar: ${err.message}`, 'erro');
  }
}

// ─── Criar tipo ───────────────────────────────────────────────────────────────

tipoForm?.addEventListener('submit', async (e) => {
  e.preventDefault();
  const nome = String(tipoNomeEl?.value || '').trim();
  if (!nome) return;

  setStatus(tipoStatusEl, 'Criando...');
  try {
    await window.Auth.apiJson('/tipos-sessao', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ nome }),
    });
    tipoForm.reset();
    await carregarTipos();
    setStatus(tipoStatusEl, 'Tipo adicionado com sucesso.', 'ok');
  } catch (err) {
    setStatus(tipoStatusEl, err.message, 'erro');
  }
});

// ─── Delegação de cliques na tabela ──────────────────────────────────────────

tiposBodyEl?.addEventListener('click', async (e) => {
  const btn = e.target.closest('button[data-action]');
  if (!btn) return;

  const acao  = btn.dataset.action;
  const id    = btn.dataset.id;
  const nome  = btn.dataset.nome;
  const ativo = btn.dataset.ativo === 'true';

  if (acao === 'editar') {
    const tipo = state.tipos.find((t) => String(t.id) === String(id));
    if (!tipo) return;
    editIdEl.value   = tipo.id;
    editNomeEl.value = tipo.nome;
    editAtivoEl.checked = tipo.ativo;
    setStatus(editStatusEl, '');
    editModal?.classList.remove('hidden');
    document.body.classList.add('modal-open');
    return;
  }

  if (acao === 'toggle') {
    try {
      await window.Auth.apiJson(`/tipos-sessao/${encodeURIComponent(id)}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ativo: !ativo }),
      });
      await carregarTipos();
    } catch (err) {
      setStatus(tipoStatusEl, err.message, 'erro');
    }
    return;
  }

  if (acao === 'deletar') {
    if (!confirm(`Remover o tipo "${nome}"? Esta ação não pode ser desfeita.`)) return;
    try {
      await window.Auth.apiJson(`/tipos-sessao/${encodeURIComponent(id)}`, { method: 'DELETE' });
      await carregarTipos();
      setStatus(tipoStatusEl, 'Tipo removido.', 'ok');
    } catch (err) {
      setStatus(tipoStatusEl, err.message, 'erro');
    }
  }
});

// ─── Modal de edição ──────────────────────────────────────────────────────────

function fecharModal() {
  editModal?.classList.add('hidden');
  document.body.classList.remove('modal-open');
}

cancelEditBtn?.addEventListener('click', fecharModal);

editForm?.addEventListener('submit', async (e) => {
  e.preventDefault();
  const id    = editIdEl?.value;
  const nome  = String(editNomeEl?.value || '').trim();
  const ativo = editAtivoEl?.checked ?? true;

  setStatus(editStatusEl, 'Salvando...');
  try {
    await window.Auth.apiJson(`/tipos-sessao/${encodeURIComponent(id)}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ nome, ativo }),
    });
    fecharModal();
    await carregarTipos();
    setStatus(tipoStatusEl, 'Tipo atualizado com sucesso.', 'ok');
  } catch (err) {
    setStatus(editStatusEl, err.message, 'erro');
  }
});

// Fecha modal ao clicar no backdrop
editModal?.addEventListener('click', (e) => {
  if (e.target === editModal) fecharModal();
});

// ─── Init ─────────────────────────────────────────────────────────────────────

refreshBtn?.addEventListener('click', carregarTipos);

(async function init() {
  const user = await window.Auth.requireAuth(['admin']);
  if (!user) return;

  const loggedName = document.getElementById('loggedUserName');
  const loggedRole = document.getElementById('loggedUserRole');
  if (loggedName) loggedName.textContent = user.nome_completo || '-';
  if (loggedRole) loggedRole.textContent = user.perfil_acesso || '-';

  document.getElementById('logoutBtn')?.addEventListener('click', () => {
    window.Auth.logout();
  });

  document.querySelectorAll('.sidebar-link[data-roles]').forEach((link) => {
    const roles = link.getAttribute('data-roles').split(',');
    if (!roles.includes(user.perfil_acesso)) link.style.display = 'none';
  });

  await carregarTipos();
}());
