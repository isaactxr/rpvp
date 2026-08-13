'use strict';

/**
 * Controlador da auditoria de sessões.
 *
 * Monta filtros, paginação e exportação dos registros somente leitura, preservando a
 * rastreabilidade das participações e o acesso autenticado às fotos auditadas.
 */
const bodyEl = document.getElementById('registrosBody');
const statusEl = document.getElementById('statusText');
const paginationInfoEl = document.getElementById('paginationInfo');
const refreshBtn = document.getElementById('refreshBtn');
const filtersForm = document.getElementById('filtersForm');
const registrosToggleFiltrosBtn = document.getElementById('registrosToggleFiltrosBtn');
const clearFiltersBtn = document.getElementById('clearFiltersBtn');
const exportPdfBtn = document.getElementById('exportPdfBtn');
const exportExcelBtn = document.getElementById('exportExcelBtn');
const prevPageBtn = document.getElementById('prevPageBtn');
const nextPageBtn = document.getElementById('nextPageBtn');

const filtroNomeEl = document.getElementById('filtroNome');
const nomesDatalistEl = document.getElementById('nomesDatalist');
const filtroDataInicioEl = document.getElementById('filtroDataInicio');
const filtroDataFimEl = document.getElementById('filtroDataFim');
const filtroInstrutorBuscaEl = document.getElementById('filtroInstrutorBusca');
const instrutorDatalistEl = document.getElementById('instrutorDatalist');
const filtroSessaoBuscaEl = document.getElementById('filtroSessaoBusca');
const sessaoDatalistEl = document.getElementById('sessaoDatalist');
const filtroTipoSessaoBuscaEl = document.getElementById('filtroTipoSessaoBusca');
const tipoSessaoDatalistEl = document.getElementById('tipoSessaoDatalist');
const filtroSetorBuscaEl = document.getElementById('filtroSetorBusca');
const setorDatalistEl = document.getElementById('setorDatalist');
const filtroStatusEl = document.getElementById('filtroStatus');
const collatorPtBr = new Intl.Collator('pt-BR', { usage: 'sort', sensitivity: 'variant' });
const APP_TIMEZONE = 'America/Sao_Paulo';

const state = {
  page: 1,
  pageSize: 20,
  totalPages: 1,
  instrutores: [],
  sessoes: [],
  tiposSessao: [],
  setores: [],
};

function atualizarToggleFiltrosRegistros() {
  if (!registrosToggleFiltrosBtn || !filtersForm) return;
  const expandido = !filtersForm.classList.contains('hidden');
  registrosToggleFiltrosBtn.textContent = expandido ? 'Ocultar filtros' : 'Mostrar filtros';
  registrosToggleFiltrosBtn.setAttribute('aria-expanded', expandido ? 'true' : 'false');
}

function compararTextoPtBr(a, b) {
  return collatorPtBr.compare(String(a || ''), String(b || ''));
}

function formatarData(data) {
  if (!data) return '-';
  const base = String(data).slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(base)) return String(data);
  const [ano, mes, dia] = base.split('-');
  return `${dia}/${mes}/${ano}`;
}

function formatarDataHora(valor) {
  if (!valor) return '-';
  const dt = new Date(valor);
  return Number.isNaN(dt.getTime()) ? String(valor) : dt.toLocaleString('pt-BR', { timeZone: APP_TIMEZONE });
}

function montarDataHoraSessao(item) {
  const inicio = formatarDataHora(item.inicio_efetivo_em);
  const fim = formatarDataHora(item.fim_efetivo_em);
  return `${inicio} - ${fim}`;
}

function formatarDuracao(intervalo) {
  if (!intervalo) return '-';

  if (typeof intervalo === 'object') {
    const hours = Number(intervalo.hours || 0);
    const minutes = Number(intervalo.minutes || 0);
    const seconds = Number(intervalo.seconds || 0);
    if ([hours, minutes, seconds].some((n) => Number.isNaN(n))) return '-';
    return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(Math.floor(seconds)).padStart(2, '0')}`;
  }

  const texto = String(intervalo);
  const [h = '00', m = '00', s = '00'] = texto.split(':');
  return `${h.padStart(2, '0')}:${m.padStart(2, '0')}:${String(s).slice(0, 2).padStart(2, '0')}`;
}

function statusLabel(status) {
  const labels = {
    nao_iniciado: 'Não iniciado',
    em_andamento: 'Em andamento',
    concluido: 'Concluído',
    ausente: 'Ausente',
  };
  return labels[status] || status || '-';
}

function statusClass(status) {
  if (status === 'concluido') return 'pill pill-ok';
  if (status === 'em_andamento') return 'pill pill-warn';
  if (status === 'ausente') return 'pill pill-danger';
  return 'pill';
}

function renderEmpty(colspan, mensagem) {
  bodyEl.innerHTML = `<tr><td colspan="${colspan}" class="empty">${mensagem}</td></tr>`;
}

function obterInstrutorIdSelecionado() {
  const nome = String(filtroInstrutorBuscaEl.value || '').trim();
  if (!nome) return '';

  const encontrado = state.instrutores.find((instrutor) => instrutor.nome_completo === nome);
  return encontrado ? String(encontrado.id) : '';
}

function rotuloSessao(sessao) {
  const tipo = String(sessao?.tipo_sessao || 'Sessão').trim();
  const local = String(sessao?.local || 'Sem local').trim();
  return `${tipo} - ${local} • ${formatarData(sessao.data)}`;
}

function obterSessaoIdSelecionada() {
  const texto = String(filtroSessaoBuscaEl.value || '').trim();
  if (!texto) return '';
  const encontrado = state.sessoes.find((sessao) => rotuloSessao(sessao) === texto);
  return encontrado ? String(encontrado.id) : '';
}

function preencherInstrutores() {
  instrutorDatalistEl.innerHTML = '';
  state.instrutores.forEach((instrutor) => {
    const option = document.createElement('option');
    option.value = instrutor.nome_completo;
    instrutorDatalistEl.appendChild(option);
  });
}

function preencherSessoes() {
  const valorAtual = String(filtroSessaoBuscaEl.value || '').trim();
  sessaoDatalistEl.innerHTML = '';
  state.sessoes.forEach((sessao) => {
    const option = document.createElement('option');
    option.value = rotuloSessao(sessao);
    sessaoDatalistEl.appendChild(option);
  });

  const existe = state.sessoes.some((sessao) => rotuloSessao(sessao) === valorAtual);
  if (!existe) {
    filtroSessaoBuscaEl.value = '';
  }
}

function preencherTiposSessao() {
  const atual = String(filtroTipoSessaoBuscaEl.value || '').trim();
  tipoSessaoDatalistEl.innerHTML = '';

  const tipos = [...new Set(state.tiposSessao.filter(Boolean))].sort(compararTextoPtBr);
  tipos.forEach((tipo) => {
    const option = document.createElement('option');
    option.value = tipo;
    tipoSessaoDatalistEl.appendChild(option);
  });

  if (atual && !tipos.includes(atual)) {
    filtroTipoSessaoBuscaEl.value = '';
  }
}

function preencherSetores() {
  const atual = String(filtroSetorBuscaEl.value || '').trim();
  setorDatalistEl.innerHTML = '';

  const nomes = [...new Set(state.setores.filter(Boolean))].sort(compararTextoPtBr);
  nomes.forEach((setor) => {
    const option = document.createElement('option');
    option.value = setor;
    setorDatalistEl.appendChild(option);
  });

  if (atual && !nomes.includes(atual)) {
    filtroSetorBuscaEl.value = '';
  }
}

function preencherNomes(listaAuditoria) {
  const nomes = [...new Set(listaAuditoria.map((item) => item.nome_completo).filter(Boolean))].slice(0, 120);
  nomesDatalistEl.innerHTML = '';
  nomes.forEach((nome) => {
    const option = document.createElement('option');
    option.value = nome;
    nomesDatalistEl.appendChild(option);
  });
}

function abrirAbaPlaceholderFotos() {
  const novaAba = window.open('', '_blank');
  if (!novaAba) return null;

  try {
    novaAba.opener = null;
  } catch (_err) {
    // Alguns navegadores não permitem alterar opener.
  }

  const documento = novaAba.document;
  documento.open();
  documento.write(`<!doctype html>
<html lang="pt-BR">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Carregando fotos...</title>
  <style>
    body { margin: 0; min-height: 100vh; display: grid; place-items: center; background: #0f172a; color: #e2e8f0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; }
    p { margin: 0; font-size: 16px; }
  </style>
</head>
<body>
  <p>Carregando foto(s)...</p>
</body>
</html>`);
  documento.close();

  return novaAba;
}

function renderizarFotosNaAba(novaAba, fotos) {
  if (!novaAba) return;

  const retornoUrl = window.location.href;

  const objectUrls = fotos.map((foto) => ({
    tipo: foto.tipo,
    url: URL.createObjectURL(foto.blob),
  }));

  const cards = objectUrls.map((foto) => `
    <section class="foto-card">
      <h2>${foto.tipo === 'checkout' ? 'Check-out' : 'Check-in'}</h2>
      <img src="${foto.url}" alt="Foto ${foto.tipo}">
    </section>
  `).join('');

  const documento = novaAba.document;
  documento.open();
  documento.write(`<!doctype html>
<html lang="pt-BR">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Fotos da presença</title>
  <style>
    :root { color-scheme: dark; }
    body { margin: 0; background: #020617; color: #e2e8f0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; }
    .topbar { position: sticky; top: 0; z-index: 2; padding: 12px 18px; border-bottom: 1px solid rgba(148, 163, 184, 0.25); background: rgba(2, 6, 23, 0.95); backdrop-filter: blur(8px); }
    .voltar-btn { border: 1px solid rgba(148, 163, 184, 0.4); border-radius: 10px; background: #0f172a; color: #e2e8f0; padding: 9px 14px; font-size: 14px; cursor: pointer; }
    .voltar-btn:hover { background: #13203b; }
    .wrap { max-width: 980px; margin: 0 auto; padding: 18px; display: grid; gap: 16px; }
    .foto-card { margin: 0; padding: 14px; border: 1px solid rgba(148, 163, 184, 0.25); border-radius: 12px; background: #0f172a; }
    .foto-card h2 { margin: 0 0 10px; font-size: 15px; letter-spacing: 0.01em; }
    .foto-card img { width: 100%; height: auto; border-radius: 10px; display: block; }
  </style>
</head>
<body>
  <header class="topbar">
    <button type="button" class="voltar-btn" onclick="voltarAplicacao()">Fechar e voltar</button>
  </header>
  <main class="wrap">${cards}</main>
  <script>
    function voltarAplicacao() {
      try {
        if (window.opener && !window.opener.closed) {
          window.opener.focus();
        }
      } catch (_err) {
        // Ignora falhas de foco.
      }

      window.close();
      if (!window.closed) {
        window.location.href = ${JSON.stringify(retornoUrl)};
      }
    }
  </script>
</body>
</html>`);
  documento.close();

  novaAba.addEventListener('beforeunload', () => {
    objectUrls.forEach((foto) => URL.revokeObjectURL(foto.url));
  }, { once: true });
}

async function baixarFotoAutenticada(url) {
  const response = await window.Auth.authFetch(url, { method: 'GET' });
  if (!response.ok) {
    let mensagem = `Falha ao carregar foto (HTTP ${response.status}).`;
    try {
      const erro = await response.json();
      mensagem = erro?.message || mensagem;
    } catch (_err) {
      // ignora parse quando resposta não for JSON
    }
    throw new Error(mensagem);
  }

  return response.blob();
}

async function abrirFotosAuditoria(presencaId) {
  const base = `${window.Auth.getApiBase()}/auditoria/imagens/${encodeURIComponent(presencaId)}`;
  const alvos = [
    { tipo: 'checkin', url: `${base}?tipo=checkin` },
    { tipo: 'checkout', url: `${base}?tipo=checkout` },
  ];

  const placeholder = abrirAbaPlaceholderFotos();
  const fotos = [];

  for (const alvo of alvos) {
    try {
      const blob = await baixarFotoAutenticada(alvo.url);
      fotos.push({ tipo: alvo.tipo, blob });
    } catch (err) {
      const mensagem = String(err.message || '').toLowerCase();
      if (mensagem.includes('não encontrada') || mensagem.includes('nao encontrada') || mensagem.includes('not found')) {
        continue;
      }
      if (placeholder && !placeholder.closed) {
        placeholder.close();
      }
      throw err;
    }
  }

  if (!fotos.length) {
    if (placeholder && !placeholder.closed) {
      placeholder.close();
    }
    throw new Error('Nenhuma foto de check-in/check-out encontrada para este registro.');
  }

  if (placeholder && !placeholder.closed) {
    renderizarFotosNaAba(placeholder, fotos);
    return;
  }

  const fallbackUrl = URL.createObjectURL(fotos[0].blob);
  window.location.assign(fallbackUrl);
}

function montarLinha(item) {
  const tr = document.createElement('tr');

  const fotoUrl = item.foto_url || null;

  tr.innerHTML = `
    <td>${item.nome_completo || '-'}</td>
    <td>${item.sessao_exibicao || item.tipo_sessao || '-'}</td>
    <td>${item.instrutor_nome || '-'}</td>
    <td class="mono">${montarDataHoraSessao(item)}</td>
    <td><span class="${statusClass(item.status)}">${statusLabel(item.status)}</span></td>
    <td class="mono">${formatarDataHora(item.check_in_em)}</td>
    <td class="mono">${formatarDataHora(item.check_out_em)}</td>
    <td class="mono">${formatarDuracao(item.duracao_participacao)}</td>
    <td>${fotoUrl ? `<button type="button" class="btn-foto" data-presenca="${item.presenca_id}">Ver</button>` : 'Sem foto'}</td>
  `;

  const fotoBtn = tr.querySelector('[data-presenca]');
  if (fotoBtn) {
    fotoBtn.addEventListener('click', async () => {
      try {
        await abrirFotosAuditoria(fotoBtn.dataset.presenca);
      } catch (err) {
        console.error('[auditoria] erro ao abrir foto:', err);
        statusEl.textContent = err.message;
      }
    });
  }

  return tr;
}

/**
 * Carrega os catálogos auxiliares da tela de auditoria (sessões, instrutores e setores) para alimentar filtros e sugestões.
 * @returns {Promise<void>}
 */
async function carregarReferencias() {
  const sessoesJson = await window.Auth.apiJson('/sessoes');
  state.sessoes = Array.isArray(sessoesJson?.data) ? sessoesJson.data : [];
  state.tiposSessao = [...new Set(state.sessoes.map((item) => String(item?.tipo_sessao || '').trim()).filter(Boolean))]
    .sort(compararTextoPtBr);

  try {
    const usuariosJson = await window.Auth.apiJson('/usuarios?perfil=instrutor&ativo=true');
    state.instrutores = Array.isArray(usuariosJson?.data) ? usuariosJson.data : [];

    const setoresJson = await window.Auth.apiJson('/setores?ativo=true');
    const setores = Array.isArray(setoresJson?.data) ? setoresJson.data : [];
    state.setores = [...new Set(setores.map((item) => item.nome).filter(Boolean))].sort(compararTextoPtBr);
  } catch (_err) {
    const dedupe = new Map();
    state.sessoes.forEach((sessao) => {
      if (sessao.instrutor_id && sessao.instrutor_nome) {
        dedupe.set(String(sessao.instrutor_id), {
          id: sessao.instrutor_id,
          nome_completo: sessao.instrutor_nome,
        });
      }
    });
    state.instrutores = Array.from(dedupe.values());
  }

  preencherInstrutores();
  preencherSessoes();
  preencherTiposSessao();
  preencherSetores();
}

/**
 * Consulta a API de auditoria com paginação, renderiza a tabela e atualiza o estado dos controles de navegação.
 * @returns {Promise<void>}
 */
async function carregarAuditoria() {
  refreshBtn.disabled = true;
  prevPageBtn.disabled = true;
  nextPageBtn.disabled = true;
  statusEl.textContent = 'Carregando auditoria...';

  try {
    const params = montarQueryFiltros(true);

    const json = await window.Auth.apiJson(`/auditoria/registros?${params.toString()}`);
    const lista = Array.isArray(json?.data) ? json.data : [];
    const pagination = json?.pagination || { page: 1, totalPages: 1, total: 0 };

    state.page = Number(pagination.page || 1);
    state.totalPages = Number(pagination.totalPages || 1);

    bodyEl.innerHTML = '';
    if (lista.length === 0) {
      renderEmpty(9, 'Nenhum registro encontrado para os filtros selecionados.');
    } else {
      lista.forEach((item) => bodyEl.appendChild(montarLinha(item)));
      preencherNomes(lista);
      state.tiposSessao = [...new Set([...state.tiposSessao, ...lista.map((item) => item.tipo_sessao).filter(Boolean)])]
        .sort(compararTextoPtBr);
      preencherTiposSessao();
      state.setores = [...new Set([...state.setores, ...lista.map((item) => item.colaborador_setor).filter(Boolean)])]
        .sort(compararTextoPtBr);
      preencherSetores();
    }

    paginationInfoEl.textContent = `Página ${state.page} de ${state.totalPages} • Total ${pagination.total || 0}`;
    statusEl.textContent = `${lista.length} linha(s) carregada(s). Dados somente leitura.`;

    prevPageBtn.disabled = state.page <= 1;
    nextPageBtn.disabled = state.page >= state.totalPages;
  } catch (err) {
    console.error('[auditoria] erro ao carregar:', err);
    renderEmpty(9, 'Falha ao carregar dados de auditoria.');
    statusEl.textContent = err.message;
  } finally {
    refreshBtn.disabled = false;
  }
}

/**
 * Converte o estado atual dos campos de filtro em query string para listagem e exportação.
 * @param {boolean} comPaginacao Define se `page` e `pageSize` devem ser enviados.
 * @returns {URLSearchParams} Parâmetros serializáveis para a API.
 */
function montarQueryFiltros(comPaginacao) {
  const params = new URLSearchParams();

  if (comPaginacao) {
    params.set('page', String(state.page));
    params.set('pageSize', String(state.pageSize));
  }

  if (filtroNomeEl.value.trim()) params.set('nome', filtroNomeEl.value.trim());
  if (filtroDataInicioEl.value) params.set('dataInicio', filtroDataInicioEl.value);
  if (filtroDataFimEl.value) params.set('dataFim', filtroDataFimEl.value);

  const instrutorId = obterInstrutorIdSelecionado();
  if (instrutorId) params.set('instrutorId', instrutorId);

  const sessaoId = obterSessaoIdSelecionada();
  if (sessaoId) params.set('sessaoId', sessaoId);

  const tipoSessao = String(filtroTipoSessaoBuscaEl.value || '').trim();
  if (tipoSessao) params.set('tipoSessao', tipoSessao);

  const setor = String(filtroSetorBuscaEl.value || '').trim();
  if (setor) params.set('setor', setor);

  if (filtroStatusEl.value) params.set('status', filtroStatusEl.value);

  return params;
}

/**
 * Solicita a geração de um arquivo de exportação e dispara o download autenticado no navegador.
 * @param {'pdf'|'excel'} tipo Formato solicitado pelo usuário.
 * @returns {Promise<void>}
 */
async function baixarExportacao(tipo) {
  const endpoint = tipo === 'pdf'
    ? '/auditoria/registros/export/pdf'
    : '/auditoria/registros/export/excel';

  const extensao = tipo === 'pdf' ? 'pdf' : 'xlsx';
  const label = tipo === 'pdf' ? 'PDF' : 'Excel';
  const partes = new Intl.DateTimeFormat('en-CA', {
    timeZone: APP_TIMEZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(new Date()).reduce((acc, part) => {
    if (part.type !== 'literal') acc[part.type] = part.value;
    return acc;
  }, {});
  const nome = `auditoria_${partes.year}-${partes.month}-${partes.day}.${extensao}`;

  exportPdfBtn.disabled = true;
  exportExcelBtn.disabled = true;
  statusEl.textContent = `Gerando exportacao ${label}...`;

  try {
    const query = montarQueryFiltros(false).toString();
    const response = await window.Auth.authFetch(
      `${window.Auth.getApiBase()}${endpoint}${query ? `?${query}` : ''}`,
      { method: 'GET' }
    );

    if (!response.ok) {
      const erro = await response.json().catch(() => ({}));
      throw new Error(erro?.message || `Falha ao exportar ${label}.`);
    }

    const blob = await response.blob();
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = nome;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);

    statusEl.textContent = `Exportacao ${label} concluida.`;
  } catch (err) {
    console.error(`[auditoria] erro ao exportar ${label}:`, err);
    statusEl.textContent = err.message;
  } finally {
    exportPdfBtn.disabled = false;
    exportExcelBtn.disabled = false;
  }
}

filtersForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  state.page = 1;
  await carregarAuditoria();
});

clearFiltersBtn.addEventListener('click', async () => {
  filtroNomeEl.value = '';
  filtroDataInicioEl.value = '';
  filtroDataFimEl.value = '';
  filtroInstrutorBuscaEl.value = '';
  filtroSessaoBuscaEl.value = '';
  filtroTipoSessaoBuscaEl.value = '';
  filtroSetorBuscaEl.value = '';
  filtroStatusEl.value = '';
  state.page = 1;
  await carregarAuditoria();
});

refreshBtn.addEventListener('click', async () => {
  await carregarReferencias();
  await carregarAuditoria();
});

prevPageBtn.addEventListener('click', async () => {
  if (state.page <= 1) return;
  state.page -= 1;
  await carregarAuditoria();
});

nextPageBtn.addEventListener('click', async () => {
  if (state.page >= state.totalPages) return;
  state.page += 1;
  await carregarAuditoria();
});

exportPdfBtn.addEventListener('click', async () => baixarExportacao('pdf'));
exportExcelBtn.addEventListener('click', async () => baixarExportacao('excel'));
registrosToggleFiltrosBtn?.addEventListener('click', () => {
  filtersForm?.classList.toggle('hidden');
  atualizarToggleFiltrosRegistros();
});

(async function init() {
  const user = await window.Auth.requireAuth(['admin', 'gestor']);
  if (!user) return;

  atualizarToggleFiltrosRegistros();
  await carregarReferencias();
  await carregarAuditoria();
})();
