'use strict';

/**
 * Módulo da dashboard operacional.
 *
 * Consolida sessões e linhas de auditoria do dia para exibir KPIs rápidos, filtros auxiliares
 * e uma visão resumida da operação corrente.
 */
const statusEl = document.getElementById('dashboardStatus');
const bodyEl = document.getElementById('dashboardBody');
const kpiSessoesEl = document.getElementById('kpiSessoes');
const kpiConcluidosEl = document.getElementById('kpiConcluidos');
const kpiAusentesEl = document.getElementById('kpiAusentes');
const dashboardFiltersFormEl = document.getElementById('dashboardFiltersForm');
const dashboardToggleFiltrosBtnEl = document.getElementById('dashboardToggleFiltrosBtn');
const dashboardLimparFiltrosBtnEl = document.getElementById('dashboardLimparFiltrosBtn');
const dashboardFiltroColaboradorEl = document.getElementById('dashboardFiltroColaborador');
const dashboardColaboradorDatalistEl = document.getElementById('dashboardColaboradorDatalist');
const dashboardFiltroDataInicioEl = document.getElementById('dashboardFiltroDataInicio');
const dashboardFiltroDataFimEl = document.getElementById('dashboardFiltroDataFim');
const dashboardFiltroTipoSessaoEl = document.getElementById('dashboardFiltroTipoSessao');
const dashboardTipoSessaoDatalistEl = document.getElementById('dashboardTipoSessaoDatalist');
const dashboardFiltroInstrutorEl = document.getElementById('dashboardFiltroInstrutor');
const dashboardInstrutorDatalistEl = document.getElementById('dashboardInstrutorDatalist');
const dashboardFiltroStatusEl = document.getElementById('dashboardFiltroStatus');

const APP_TIMEZONE = 'America/Sao_Paulo';

const state = {
  instrutores: [],
  tiposSessao: [],
};

function atualizarToggleFiltrosDashboard() {
  if (!dashboardToggleFiltrosBtnEl || !dashboardFiltersFormEl) return;
  const expandido = !dashboardFiltersFormEl.classList.contains('hidden');
  dashboardToggleFiltrosBtnEl.textContent = expandido ? 'Ocultar filtros' : 'Mostrar filtros';
  dashboardToggleFiltrosBtnEl.setAttribute('aria-expanded', expandido ? 'true' : 'false');
}

function formatarDataHora(valor) {
  if (!valor) return '-';
  const dt = new Date(valor);
  return Number.isNaN(dt.getTime()) ? String(valor) : dt.toLocaleString('pt-BR', { timeZone: APP_TIMEZONE });
}

function statusLabel(status) {
  const mapa = {
    nao_iniciado: 'Não iniciado',
    em_andamento: 'Em andamento',
    concluido: 'Concluído',
    ausente: 'Ausente',
  };

  return mapa[status] || status || '-';
}

function statusClass(status) {
  if (status === 'concluido') return 'pill pill-ok';
  if (status === 'em_andamento') return 'pill pill-warn';
  if (status === 'ausente') return 'pill pill-danger';
  return 'pill';
}

function renderEmpty(msg) {
  bodyEl.innerHTML = `<tr><td colspan="6" class="empty">${msg}</td></tr>`;
}

function obterDataHojeLocal() {
  const partes = new Intl.DateTimeFormat('en-CA', {
    timeZone: APP_TIMEZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(new Date()).reduce((acc, part) => {
    if (part.type !== 'literal') acc[part.type] = part.value;
    return acc;
  }, {});

  return `${partes.year}-${partes.month}-${partes.day}`;
}

function preencherDatalist(el, lista) {
  if (!el) return;
  el.innerHTML = '';
  lista.forEach((valor) => {
    const option = document.createElement('option');
    option.value = valor;
    el.appendChild(option);
  });
}

/**
 * Constrói a query da dashboard sempre limitada ao dia atual, aplicando os filtros opcionais visíveis na UI.
 * @returns {URLSearchParams} Parâmetros prontos para a chamada de auditoria.
 */
function montarFiltrosDashboard() {
  const dataHoje = obterDataHojeLocal();
  const dataInicio = String(dashboardFiltroDataInicioEl?.value || '').trim() || dataHoje;
  const dataFim = String(dashboardFiltroDataFimEl?.value || '').trim() || dataHoje;
  const params = new URLSearchParams({
    dataInicio,
    dataFim,
    page: '1',
    pageSize: '20',
  });

  const colaborador = String(dashboardFiltroColaboradorEl?.value || '').trim();
  if (colaborador) params.set('nome', colaborador);

  const tipoSessao = String(dashboardFiltroTipoSessaoEl?.value || '').trim();
  if (tipoSessao) params.set('tipoSessao', tipoSessao);

  const instrutorNome = String(dashboardFiltroInstrutorEl?.value || '').trim();
  if (instrutorNome) {
    const encontrado = state.instrutores.find((item) => item.nome_completo === instrutorNome);
    if (encontrado) params.set('instrutorId', String(encontrado.id));
  }

  const status = String(dashboardFiltroStatusEl?.value || '').trim();
  if (status) params.set('status', status);

  return params;
}

/**
 * Carrega listas auxiliares usadas pelos filtros, como instrutores disponíveis e tipos de sessão existentes.
 * @returns {Promise<void>}
 */
async function carregarReferenciasDashboard() {
  const sessoesJson = await window.Auth.apiJson('/sessoes');
  const sessoes = Array.isArray(sessoesJson?.data) ? sessoesJson.data : [];
  state.instrutores = [...new Map(
    sessoes
      .filter((item) => item?.instrutor_id && item?.instrutor_nome)
      .map((item) => [String(item.instrutor_id), { id: item.instrutor_id, nome_completo: item.instrutor_nome }])
  ).values()];

  state.tiposSessao = [...new Set(sessoes.map((item) => String(item?.tipo_sessao || '').trim()).filter(Boolean))]
    .sort((a, b) => a.localeCompare(b, 'pt-BR'));

  preencherDatalist(
    dashboardInstrutorDatalistEl,
    [...new Set(state.instrutores.map((item) => String(item.nome_completo || '').trim()).filter(Boolean))]
      .sort((a, b) => a.localeCompare(b, 'pt-BR')),
  );
  preencherDatalist(dashboardTipoSessaoDatalistEl, state.tiposSessao);
}

/**
 * Busca os dados do dia e atualiza KPIs, datalists e tabela resumida da dashboard.
 * @returns {Promise<void>}
 */
async function carregarDados() {
  statusEl.textContent = 'Carregando dados...';

  try {
    const dataHoje = obterDataHojeLocal();
    const filtros = montarFiltrosDashboard();

    const [sessoes, auditoria] = await Promise.all([
      window.Auth.apiJson(`/sessoes?data=${encodeURIComponent(dataHoje)}`),
      window.Auth.apiJson(`/auditoria/registros?${filtros.toString()}`),
    ]);

    const listaSessoes = Array.isArray(sessoes?.data) ? sessoes.data : [];
    const linhas = Array.isArray(auditoria?.data) ? auditoria.data : [];

    kpiSessoesEl.textContent = String(listaSessoes.length);
    kpiConcluidosEl.textContent = String(linhas.filter((item) => item.status === 'concluido').length);
    kpiAusentesEl.textContent = String(linhas.filter((item) => item.status === 'ausente').length);

    preencherDatalist(
      dashboardColaboradorDatalistEl,
      [...new Set(linhas.map((item) => String(item.nome_completo || '').trim()).filter(Boolean))]
        .sort((a, b) => a.localeCompare(b, 'pt-BR')),
    );

    bodyEl.innerHTML = '';
    if (linhas.length === 0) {
      renderEmpty('Sem dados de auditoria para hoje.');
    } else {
      linhas.slice(0, 20).forEach((item) => {
        const tr = document.createElement('tr');
        tr.innerHTML = `
          <td>${item.nome_completo || '-'}</td>
          <td>${item.sessao_exibicao || item.tipo_sessao || '-'}</td>
          <td>${item.instrutor_nome || '-'}</td>
          <td><span class="${statusClass(item.status)}">${statusLabel(item.status)}</span></td>
          <td>${formatarDataHora(item.check_in_em)}</td>
          <td>${formatarDataHora(item.check_out_em)}</td>
        `;
        bodyEl.appendChild(tr);
      });
    }

    statusEl.textContent = `${linhas.length} registro(s) de auditoria hoje.`;
  } catch (err) {
    console.error('[dashboard] erro ao carregar dados:', err);
    statusEl.textContent = err.message;
    renderEmpty('Falha ao carregar dashboard.');
  }
}

(async function init() {
  const user = await window.Auth.requireAuth(['admin', 'gestor', 'instrutor']);
  if (!user) return;

  const hoje = obterDataHojeLocal();
  if (dashboardFiltroDataInicioEl && !dashboardFiltroDataInicioEl.value) {
    dashboardFiltroDataInicioEl.value = hoje;
  }
  if (dashboardFiltroDataFimEl && !dashboardFiltroDataFimEl.value) {
    dashboardFiltroDataFimEl.value = hoje;
  }

  atualizarToggleFiltrosDashboard();
  await carregarReferenciasDashboard();
  await carregarDados();
})();

dashboardToggleFiltrosBtnEl?.addEventListener('click', () => {
  dashboardFiltersFormEl?.classList.toggle('hidden');
  atualizarToggleFiltrosDashboard();
});

dashboardFiltersFormEl?.addEventListener('submit', async (event) => {
  event.preventDefault();
  await carregarDados();
});

dashboardLimparFiltrosBtnEl?.addEventListener('click', async () => {
  const hoje = obterDataHojeLocal();
  if (dashboardFiltroColaboradorEl) dashboardFiltroColaboradorEl.value = '';
  if (dashboardFiltroDataInicioEl) dashboardFiltroDataInicioEl.value = hoje;
  if (dashboardFiltroDataFimEl) dashboardFiltroDataFimEl.value = hoje;
  if (dashboardFiltroTipoSessaoEl) dashboardFiltroTipoSessaoEl.value = '';
  if (dashboardFiltroInstrutorEl) dashboardFiltroInstrutorEl.value = '';
  if (dashboardFiltroStatusEl) dashboardFiltroStatusEl.value = '';
  await carregarDados();
});
