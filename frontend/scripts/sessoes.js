'use strict';

/**
 * Módulo de gestão/listagem de sessões.
 *
 * Responsável por listar sessões ativas/encerradas, aplicar filtros
 * operacionais e abrir o fluxo de criação de sessão.
 */

const sessaoStatusEl = document.getElementById('sessaoStatus');
const sessoesAtivasListaEl = document.getElementById('sessoesAtivasLista');
const refreshSessoesBtn = document.getElementById('refreshSessoesBtn');
const abrirCriarSessaoBtn = document.getElementById('abrirCriarSessaoBtn');

const criarSessaoModalEl = document.getElementById('criarSessaoModal');
const cancelarCriarSessaoBtn = document.getElementById('cancelarCriarSessaoBtn');
const sessaoForm = document.getElementById('sessaoForm');
const sessaoInstrutorNomeEl = document.getElementById('sessaoInstrutorNome');
const sessaoTipoEl = document.getElementById('sessaoTipo');
const sessaoTipoSugestoesEl = document.getElementById('sessaoTipoSugestoes');
const sessaoDescricaoEl = document.getElementById('sessaoDescricao');
const sessaoLocalEl = document.getElementById('sessaoLocal');
const sessaoCheckoutHabilitadoEl = document.getElementById('sessaoCheckoutHabilitado');
const mostrarEncerradasHojeChk = document.getElementById('mostrarEncerradasHojeChk');
const mostrarEncerradasWrap = document.getElementById('mostrarEncerradasWrap');
const encerradasFiltrosWrap = document.getElementById('encerradasFiltrosWrap');
const filtroEncerradasTipoEl = document.getElementById('filtroEncerradasTipo');
const filtroEncerradasTipoDatalistEl = document.getElementById('filtroEncerradasTipoDatalist');
const filtroEncerradasDataInicioEl = document.getElementById('filtroEncerradasDataInicio');
const filtroEncerradasDataFimEl = document.getElementById('filtroEncerradasDataFim');
const limparFiltrosEncerradasBtn = document.getElementById('limparFiltrosEncerradasBtn');

function valorCampo(el) {
  return String(el?.value || '').trim();
}

const state = {
  user: null,
  podeCriarSessao: false,
  tiposSessao: [],
  sessoesAtivas: [],
  sessoesBase: [],
};

function formatarDataBr(valor) {
  if (!valor) return '';

  const texto = String(valor).trim();
  const baseData = texto.slice(0, 10);
  if (/^\d{4}-\d{2}-\d{2}$/.test(baseData)) {
    const [ano, mes, dia] = baseData.split('-');
    return `${dia}/${mes}/${ano}`;
  }

  const dt = new Date(texto);
  return Number.isNaN(dt.getTime())
    ? texto
    : dt.toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' });
}

function formatarHoraBr(valor) {
  if (!valor) return '';

  const match = String(valor).trim().match(/^(\d{2}):(\d{2})(?::(\d{2}))?/);
  if (match) {
    const horas = match[1];
    const minutos = match[2];
    const segundos = match[3] || '00';
    return `${horas}:${minutos}:${segundos}`;
  }

  const dt = new Date(String(valor));
  return Number.isNaN(dt.getTime())
    ? String(valor)
    : dt.toLocaleTimeString('pt-BR', {
        timeZone: 'America/Sao_Paulo',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hour12: false,
      });
}

function formatarDataHoraBr(valor) {
  const dt = new Date(valor);
  if (Number.isNaN(dt.getTime())) return '';
  return dt.toLocaleString('pt-BR', {
    timeZone: 'America/Sao_Paulo',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  });
}

function montarLabelBotaoSessao(sessao) {
  const tipo = String(sessao?.tipo_sessao || sessao?.nome || 'Sessão').trim();
  const local = String(sessao?.local || 'Sem local').trim();

  let dataHora = '-';
  if (sessao?.inicio_efetivo_em) {
    dataHora = formatarDataHoraBr(sessao.inicio_efetivo_em) || '-';
  } else {
    const dataFmt = formatarDataBr(sessao?.data);
    const horaFmt = formatarHoraBr(sessao?.horario_inicio);
    if (dataFmt && horaFmt) {
      dataHora = `${dataFmt}, ${horaFmt}`;
    } else if (dataFmt) {
      dataHora = dataFmt;
    } else if (horaFmt) {
      dataHora = horaFmt;
    }
  }

  return `${tipo} - ${local} - ${dataHora}`;
}

function obterDataHojeLocal() {
  const partes = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Sao_Paulo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(new Date()).reduce((acc, part) => {
    if (part.type !== 'literal') acc[part.type] = part.value;
    return acc;
  }, {});
  return `${partes.year}-${partes.month}-${partes.day}`;
}

function obterDataLocalDiasAtras(dias) {
  const base = new Date();
  base.setDate(base.getDate() - Math.max(0, Number(dias) || 0));
  const partes = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Sao_Paulo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(base).reduce((acc, part) => {
    if (part.type !== 'literal') acc[part.type] = part.value;
    return acc;
  }, {});
  return `${partes.year}-${partes.month}-${partes.day}`;
}

function atualizarVisibilidadeFiltrosEncerradas() {
  if (!encerradasFiltrosWrap) return;
  const mostrar = Boolean(mostrarEncerradasHojeChk?.checked);
  encerradasFiltrosWrap.classList.toggle('hidden', !mostrar);
}

function preencherTiposFiltrosEncerradas() {
  if (!filtroEncerradasTipoDatalistEl) return;
  filtroEncerradasTipoDatalistEl.innerHTML = '';
  state.tiposSessao.forEach((nome) => {
    const option = document.createElement('option');
    option.value = nome;
    filtroEncerradasTipoDatalistEl.appendChild(option);
  });
}

function aplicarDefaultUltimos7Dias() {
  if (filtroEncerradasDataInicioEl) filtroEncerradasDataInicioEl.value = obterDataLocalDiasAtras(6);
  if (filtroEncerradasDataFimEl) filtroEncerradasDataFimEl.value = obterDataHojeLocal();
}

function filtrarSessoesEncerradas(lista) {
  const tipo = valorCampo(filtroEncerradasTipoEl).toLowerCase();
  const dataInicio = String(filtroEncerradasDataInicioEl?.value || '').trim();
  const dataFim = String(filtroEncerradasDataFimEl?.value || '').trim();

  return (Array.isArray(lista) ? lista : [])
    .filter((item) => Boolean(item?.fim_efetivo_em))
    .filter((item) => {
      const tipoAtual = String(item?.tipo_sessao || item?.nome || '').toLowerCase();
      return !tipo || tipoAtual.includes(tipo);
    })
    .filter((item) => {
      const dataAtual = String(item?.data || '').slice(0, 10);
      if (!dataAtual) return false;
      if (dataInicio && dataAtual < dataInicio) return false;
      if (dataFim && dataAtual > dataFim) return false;
      return true;
    });
}

function renderSessoesAtivas() {
  if (!sessoesAtivasListaEl) return;

  sessoesAtivasListaEl.innerHTML = '';
  if (state.sessoesAtivas.length === 0) {
    sessoesAtivasListaEl.innerHTML = '<span class="muted-text">Nenhuma sessão ativa/não encerrada no momento.</span>';
    return;
  }

  state.sessoesAtivas.forEach((sessao) => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'ghost-btn sessao-list-btn';
    btn.textContent = montarLabelBotaoSessao(sessao);
    btn.addEventListener('click', () => {
      window.location.href = `sessao.html?id=${encodeURIComponent(sessao.id)}`;
    });
    sessoesAtivasListaEl.appendChild(btn);
  });
}

async function carregarSessoesAtivas() {
  const mostrarEncerradas = Boolean(mostrarEncerradasHojeChk?.checked);

  if (!mostrarEncerradas) {
    const jsonAtivas = await window.Auth.apiJson('/sessoes?ativo=true');
    const ativas = Array.isArray(jsonAtivas?.data) ? jsonAtivas.data : [];
    state.sessoesBase = ativas;
    state.sessoesAtivas = ativas;
  } else {
    const jsonTodas = await window.Auth.apiJson('/sessoes');
    const todas = Array.isArray(jsonTodas?.data) ? jsonTodas.data : [];
    state.sessoesBase = todas;
    state.sessoesAtivas = filtrarSessoesEncerradas(todas);
  }

  renderSessoesAtivas();
  if (sessaoStatusEl) {
    sessaoStatusEl.textContent = mostrarEncerradas
      ? `${state.sessoesAtivas.length} sessão(ões) encerrada(s) no filtro selecionado.`
      : `${state.sessoesAtivas.length} sessão(ões) ativa(s)/não encerrada(s).`;
  }
}

async function aplicarFiltrosEncerradasComEstadoAtual() {
  if (!mostrarEncerradasHojeChk?.checked) return;
  state.sessoesAtivas = filtrarSessoesEncerradas(state.sessoesBase);
  renderSessoesAtivas();
  if (sessaoStatusEl) {
    sessaoStatusEl.textContent = `${state.sessoesAtivas.length} sessão(ões) encerrada(s) no filtro selecionado.`;
  }
}

function abrirModalCriacao() {
  if (!state.podeCriarSessao || !criarSessaoModalEl) return;
  criarSessaoModalEl.classList.remove('hidden');
  document.body.classList.add('modal-open');
  sessaoTipoEl?.focus();
}

function fecharModalCriacao() {
  criarSessaoModalEl?.classList.add('hidden');
  document.body.classList.remove('modal-open');
}

function renderSugestoesTipoSessao(termo = '') {
  if (!sessaoTipoSugestoesEl) return;

  const busca = String(termo || '').trim().toLowerCase();
  const tiposFiltrados = state.tiposSessao.filter((nome) => nome.toLowerCase().includes(busca)).slice(0, 10);

  if (tiposFiltrados.length === 0) {
    sessaoTipoSugestoesEl.innerHTML = '';
    sessaoTipoSugestoesEl.classList.add('hidden');
    return;
  }

  sessaoTipoSugestoesEl.innerHTML = '';
  tiposFiltrados.forEach((nome) => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'suggestion-item';
    btn.textContent = nome;
    btn.addEventListener('mousedown', (event) => {
      event.preventDefault();
      sessaoTipoEl.value = nome;
      sessaoTipoSugestoesEl.classList.add('hidden');
    });
    sessaoTipoSugestoesEl.appendChild(btn);
  });

  sessaoTipoSugestoesEl.classList.remove('hidden');
}

async function carregarTiposSessao() {
  try {
    const json = await window.Auth.apiJson('/tipos-sessao?ativo=true');
    state.tiposSessao = (Array.isArray(json?.data) ? json.data : [])
      .map((tipo) => String(tipo?.nome || '').trim())
      .filter(Boolean)
      .sort((a, b) => a.localeCompare(b, 'pt-BR'));
  } catch (_err) {
    state.tiposSessao = [];
  }
}


sessaoTipoEl?.addEventListener('focus', () => {
  renderSugestoesTipoSessao(sessaoTipoEl.value);
});

sessaoTipoEl?.addEventListener('input', () => {
  renderSugestoesTipoSessao(sessaoTipoEl.value);
});

sessaoTipoEl?.addEventListener('blur', () => {
  setTimeout(() => sessaoTipoSugestoesEl?.classList.add('hidden'), 120);
});

abrirCriarSessaoBtn?.addEventListener('click', abrirModalCriacao);
cancelarCriarSessaoBtn?.addEventListener('click', fecharModalCriacao);
criarSessaoModalEl?.addEventListener('click', (event) => {
  if (event.target === criarSessaoModalEl) {
    fecharModalCriacao();
  }
});

refreshSessoesBtn?.addEventListener('click', async () => {
  refreshSessoesBtn.disabled = true;
  try {
    await carregarSessoesAtivas();
  } catch (err) {
    if (sessaoStatusEl) sessaoStatusEl.textContent = err.message;
  } finally {
    refreshSessoesBtn.disabled = false;
  }
});

mostrarEncerradasHojeChk?.addEventListener('change', async () => {
  try {
    atualizarVisibilidadeFiltrosEncerradas();
    if (mostrarEncerradasHojeChk.checked) {
      aplicarDefaultUltimos7Dias();
      preencherTiposFiltrosEncerradas();
      if (filtroEncerradasTipoEl) filtroEncerradasTipoEl.value = '';
    }
    await carregarSessoesAtivas();
  } catch (err) {
    if (sessaoStatusEl) sessaoStatusEl.textContent = err.message;
  }
});

filtroEncerradasTipoEl?.addEventListener('input', async () => {
  await aplicarFiltrosEncerradasComEstadoAtual();
});

filtroEncerradasDataInicioEl?.addEventListener('change', async () => {
  await aplicarFiltrosEncerradasComEstadoAtual();
});

filtroEncerradasDataFimEl?.addEventListener('change', async () => {
  await aplicarFiltrosEncerradasComEstadoAtual();
});

limparFiltrosEncerradasBtn?.addEventListener('click', async () => {
  if (filtroEncerradasTipoEl) filtroEncerradasTipoEl.value = '';
  aplicarDefaultUltimos7Dias();
  await aplicarFiltrosEncerradasComEstadoAtual();
});

sessaoForm?.addEventListener('submit', async (event) => {
  event.preventDefault();
  if (!state.podeCriarSessao) return;

  if (sessaoStatusEl) sessaoStatusEl.textContent = 'Criando sessão...';

  try {
    const respostaCriacao = await window.Auth.apiJson('/sessoes', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        tipoSessao: valorCampo(sessaoTipoEl),
        descricao: valorCampo(sessaoDescricaoEl) || null,
        local: valorCampo(sessaoLocalEl) || null,
        checkoutHabilitado: Boolean(sessaoCheckoutHabilitadoEl?.checked),
      }),
    });

    const sessaoId = respostaCriacao?.data?.id;
    sessaoForm.reset();
    if (sessaoInstrutorNomeEl) sessaoInstrutorNomeEl.value = state.user?.nome_completo || '-';
    await carregarSessoesAtivas();
    fecharModalCriacao();

    if (sessaoStatusEl) {
      sessaoStatusEl.textContent = 'Sessão criada com sucesso.';
    }

    if (sessaoId) {
      window.location.href = `sessao.html?id=${encodeURIComponent(sessaoId)}`;
    }
  } catch (err) {
    if (sessaoStatusEl) sessaoStatusEl.textContent = err.message;
  }
});


(async function init() {
  const user = await window.Auth.requireAuth(['admin', 'gestor', 'instrutor', 'colaborador']);
  if (!user) return;

  state.user = user;
  state.podeCriarSessao = ['admin', 'instrutor'].includes(user.perfil_acesso);

  if (sessaoInstrutorNomeEl) {
    sessaoInstrutorNomeEl.value = user.nome_completo || '-';
  }

  if (abrirCriarSessaoBtn) {
    abrirCriarSessaoBtn.classList.toggle('hidden', !state.podeCriarSessao);
  }

  if (user.perfil_acesso === 'colaborador') {
    if (mostrarEncerradasHojeChk) {
      mostrarEncerradasHojeChk.checked = false;
      mostrarEncerradasHojeChk.disabled = true;
    }
    mostrarEncerradasWrap?.classList.add('hidden');
    encerradasFiltrosWrap?.classList.add('hidden');
  }

  if (!state.podeCriarSessao && sessaoStatusEl) {
    sessaoStatusEl.textContent = 'Seu perfil não possui permissão para criar sessões.';
  }

  try {
    await carregarTiposSessao();
    preencherTiposFiltrosEncerradas();
    atualizarVisibilidadeFiltrosEncerradas();
    await carregarSessoesAtivas();
  } catch (err) {
    if (sessaoStatusEl) sessaoStatusEl.textContent = err.message;
  }
})();
