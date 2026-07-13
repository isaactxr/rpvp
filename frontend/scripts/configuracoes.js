'use strict';

/**
 * Módulo administrativo de configurações.
 *
 * Carrega as chaves persistidas no backend, permite edição em lote e oferece um preview
 * visual para calibrar os parâmetros de detecção facial sem reiniciar o servidor.
 */

// ─── Estado ───────────────────────────────────────────────────────────────────

let _configs = [];  // array completo retornado pela API
let _olhosFechados = false;
let _tiposSessao = [];

// ─── Helpers DOM ─────────────────────────────────────────────────────────────

function getEl(id) {
  return document.getElementById(id);
}

function setStatus(elId, msg, estilo = '') {
  const el = getEl(elId);
  if (!el) return;
  el.textContent = msg;
  el.style.color = estilo === 'erro' ? '#f87171' : estilo === 'ok' ? '#22c55e' : '';
}

function toNumber(valor, padrao = 0) {
  const n = Number(valor);
  return Number.isFinite(n) ? n : padrao;
}

function clamp(valor, min, max) {
  return Math.min(max, Math.max(min, valor));
}

function marcarAlteracaoPendente() {
  const status = getEl('configStatusGlobal');
  if (!status) return;
  if (status.textContent.includes('salva')) return;
  setStatus('configStatusGlobal', 'Alterações locais pendentes. Clique em salvar para aplicar no sistema.');
}

function lerParametrosPreview() {
  const earFechado = toNumber(getEl('ear_fechado')?.value, 0.20);
  const earAberto = toNumber(getEl('ear_aberto')?.value, 0.25);
  const areaMinima = toNumber(getEl('area_minima_rosto')?.value, 0.08);
  const limiar = toNumber(getEl('limiar_similaridade')?.value, 0.75);
  const framesFechado = toNumber(getEl('frames_fechado_min')?.value, 2);
  const framesAberto = toNumber(getEl('frames_aberto_min')?.value, 2);

  return {
    earFechado,
    earAberto,
    areaMinima,
    limiar,
    framesFechado,
    framesAberto,
  };
}

function montarPontosOlho(centroX, centroY, meiaLargura, abertura) {
  const aberturaSuperior = abertura;
  const aberturaInferior = abertura * 0.9;
  return [
    [centroX - meiaLargura, centroY],
    [centroX - meiaLargura * 0.45, centroY - aberturaSuperior],
    [centroX + meiaLargura * 0.45, centroY - aberturaSuperior],
    [centroX + meiaLargura, centroY],
    [centroX + meiaLargura * 0.45, centroY + aberturaInferior],
    [centroX - meiaLargura * 0.45, centroY + aberturaInferior],
  ];
}

function desenharOverlayPreview(cor, params) {
  const canvas = getEl('facePreviewOverlay');
  const imgVisivel = _olhosFechados ? getEl('faceImgClosed') : getEl('faceImgOpen');
  if (!canvas || !imgVisivel) return;

  const largura = Math.max(1, Math.round(imgVisivel.clientWidth));
  const altura = Math.max(1, Math.round(imgVisivel.clientHeight));
  if (!largura || !altura) return;

  if (canvas.width !== largura || canvas.height !== altura) {
    canvas.width = largura;
    canvas.height = altura;
  }

  const ctx = canvas.getContext('2d');
  if (!ctx) return;

  ctx.clearRect(0, 0, largura, altura);

  const areaNorm = clamp((params.areaMinima - 0.01) / 0.49, 0, 1);
  const escalaRosto = 0.78 + areaNorm * 0.44;
  const boxW = largura * 0.56 * escalaRosto;
  const boxH = altura * 0.68 * escalaRosto;
  const boxX = (largura - boxW) / 2;
  const boxY = altura * 0.5 - boxH * 0.55;

  const limiarNorm = clamp((params.limiar - 0.5) / 0.5, 0, 1);
  const alpha = 0.52 + limiarNorm * 0.42;
  const mediaFrames = (params.framesFechado + params.framesAberto) / 2;
  const raioPonto = clamp(1.9 + mediaFrames * 0.24, 2, 4.2);
  const lineWidth = clamp(1.2 + limiarNorm * 1.4, 1.2, 2.6);

  ctx.strokeStyle = cor;
  ctx.globalAlpha = alpha;
  ctx.lineWidth = lineWidth;
  ctx.strokeRect(boxX, boxY, boxW, boxH);

  const earFechadoNorm = clamp((params.earFechado - 0.05) / 0.35, 0, 1);
  const earAbertoNorm = clamp((params.earAberto - 0.10) / 0.40, 0, 1);
  const aberturaFechado = clamp(0.002 + earFechadoNorm * 0.028, 0.002, 0.030);
  const aberturaAberto = clamp(0.018 + earAbertoNorm * 0.072, 0.018, 0.090);
  const deltaFrames = clamp((params.framesAberto - params.framesFechado) / 10, -1, 1);
  const separacaoOlhos = 0.24 + deltaFrames * 0.018;
  const centroY = 0.455 + (0.5 - limiarNorm) * 0.03;
  const meiaLargura = 0.056 + areaNorm * 0.025;
  const centroEsq = 0.5 - separacaoOlhos / 2;
  const centroDir = 0.5 + separacaoOlhos / 2;

  const pontosAbertos = [
    ...montarPontosOlho(centroEsq, centroY, meiaLargura, aberturaAberto),
    ...montarPontosOlho(centroDir, centroY, meiaLargura, aberturaAberto),
  ];
  const pontosFechados = [
    ...montarPontosOlho(centroEsq, centroY, meiaLargura, aberturaFechado),
    ...montarPontosOlho(centroDir, centroY, meiaLargura, aberturaFechado),
  ];

  const pontosAtivos = _olhosFechados ? pontosFechados : pontosAbertos;
  const pontosInativos = _olhosFechados ? pontosAbertos : pontosFechados;

  ctx.globalAlpha = 0.24;
  ctx.fillStyle = '#93c5fd';
  pontosInativos.forEach(([x, y]) => {
    ctx.beginPath();
    ctx.arc(x * largura, y * altura, Math.max(1.5, raioPonto - 0.8), 0, Math.PI * 2);
    ctx.fill();
  });

  ctx.globalAlpha = alpha;
  ctx.fillStyle = cor;
  pontosAtivos.forEach(([x, y]) => {
    ctx.beginPath();
    ctx.arc(x * largura, y * altura, raioPonto, 0, Math.PI * 2);
    ctx.fill();
  });

  ctx.globalAlpha = 1;
}

function atualizarPreviewFacial() {
  const params = lerParametrosPreview();
  const earFechado = params.earFechado;
  const earAberto = params.earAberto;

  // EAR simulado para o preview: valor baixo quando olho fechado, alto quando aberto
  const earAtual = _olhosFechados
    ? Math.max(0, earFechado - 0.02)
    : Math.min(1, earAberto + 0.02);

  const eyeOpen = getEl('faceImgOpen');
  const eyeClosed = getEl('faceImgClosed');
  const modoEl = getEl('previewModoOlho');
  const earAtualEl = getEl('previewEarAtual');
  const earFechadoEl = getEl('previewEarFechado');
  const earAbertoEl = getEl('previewEarAberto');
  const classifEl = getEl('previewClassificacao');
  const alternarBtn = getEl('alternarOlhosBtn');

  if (eyeOpen) eyeOpen.classList.toggle('hidden', _olhosFechados);
  if (eyeClosed) eyeClosed.classList.toggle('hidden', !_olhosFechados);
  if (modoEl) modoEl.textContent = _olhosFechados ? 'Olhos fechados' : 'Olhos abertos';
  if (earAtualEl) earAtualEl.textContent = earAtual.toFixed(2);
  if (earFechadoEl) earFechadoEl.textContent = earFechado.toFixed(2);
  if (earAbertoEl) earAbertoEl.textContent = earAberto.toFixed(2);

  let classificacao = 'Zona neutra';
  let pillClass = 'pill';
  let corOverlay = '#f59e0b';
  if (earAtual <= earFechado) {
    classificacao = 'Classificado como FECHADO';
    pillClass = 'pill pill-warn';
    corOverlay = '#f59e0b';
  } else if (earAtual >= earAberto) {
    classificacao = 'Classificado como ABERTO';
    pillClass = 'pill pill-ok';
    corOverlay = '#22c55e';
  }

  if (classifEl) {
    classifEl.textContent = classificacao;
    classifEl.className = pillClass;
  }

  if (alternarBtn) {
    alternarBtn.textContent = _olhosFechados
      ? 'Alternar para olhos abertos'
      : 'Alternar para olhos fechados';
  }

  desenharOverlayPreview(corOverlay, params);
}

function iniciarInteracoesPreview() {
  const alternarBtn = getEl('alternarOlhosBtn');
  alternarBtn?.addEventListener('click', () => {
    _olhosFechados = !_olhosFechados;
    atualizarPreviewFacial();
  });

  getEl('faceImgOpen')?.addEventListener('load', atualizarPreviewFacial);
  getEl('faceImgClosed')?.addEventListener('load', atualizarPreviewFacial);
  window.addEventListener('resize', atualizarPreviewFacial);

  ['ear_fechado', 'ear_aberto', 'frames_fechado_min', 'frames_aberto_min', 'area_minima_rosto', 'limiar_similaridade']
    .forEach((id) => {
      getEl(id)?.addEventListener('input', () => {
        marcarAlteracaoPendente();
        atualizarPreviewFacial();
      });
    });

  // Marca alteração pendente para os demais campos também
  _configs.forEach((cfg) => {
    getEl(cfg.chave)?.addEventListener('input', marcarAlteracaoPendente);
    getEl(cfg.chave)?.addEventListener('change', marcarAlteracaoPendente);
  });
}

async function carregarTiposSessaoAdmin() {
  try {
    const json = await window.Auth.apiJson('/tipos-sessao');
    _tiposSessao = Array.isArray(json?.data) ? json.data : [];
  } catch (_err) {
    _tiposSessao = [];
  }
  renderTiposSessaoAdmin();
}

function renderTiposSessaoAdmin() {
  const body = getEl('tiposListaBody');
  if (!body) return;

  if (_tiposSessao.length === 0) {
    body.innerHTML = '<tr><td colspan="3" class="empty">Nenhum tipo cadastrado.</td></tr>';
    return;
  }

  body.innerHTML = '';
  _tiposSessao.forEach((tipo) => {
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td class="tipos-nome-cell">
        <span class="tipos-nome-text">${tipo.nome}</span>
        <input class="tipos-nome-edit hidden" type="text" value="${tipo.nome}" maxlength="80" />
      </td>
      <td><span class="${tipo.ativo ? 'pill pill-ok' : 'pill'}">${tipo.ativo ? 'Ativo' : 'Inativo'}</span></td>
      <td class="form-actions">
        <button type="button" class="ghost-btn btn-editar-tipo" data-id="${tipo.id}">Editar</button>
        <button type="button" class="ghost-btn btn-salvar-tipo hidden" data-id="${tipo.id}">Salvar</button>
        <button type="button" class="danger-soft-btn btn-excluir-tipo" data-id="${tipo.id}">Excluir</button>
      </td>
    `;
    body.appendChild(tr);
  });
}

function iniciarInteracoesTiposSessao() {
  const btnAdicionar = getEl('adicionarTipoSessaoBtn');
  const inputNome = getEl('novoTipoSessaoNome');
  const status = getEl('tiposSessaoStatus');
  const body = getEl('tiposListaBody');

  inputNome?.addEventListener('keydown', (event) => {
    if (event.key === 'Enter') {
      event.preventDefault();
      btnAdicionar?.click();
    }
  });

  btnAdicionar?.addEventListener('click', async () => {
    const nome = String(inputNome?.value || '').trim();
    if (!nome) {
      if (status) status.textContent = 'Informe o nome do tipo de sessão.';
      inputNome?.focus();
      return;
    }

    if (status) status.textContent = 'Adicionando tipo...';
    try {
      await window.Auth.apiJson('/tipos-sessao', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ nome }),
      });
      if (inputNome) inputNome.value = '';
      await carregarTiposSessaoAdmin();
      if (status) status.textContent = 'Tipo adicionado com sucesso.';
    } catch (err) {
      if (status) status.textContent = err.message;
    }
  });

  body?.addEventListener('click', async (event) => {
    const btnEditar = event.target.closest('.btn-editar-tipo');
    const btnSalvar = event.target.closest('.btn-salvar-tipo');
    const btnExcluir = event.target.closest('.btn-excluir-tipo');

    if (btnEditar) {
      const tr = btnEditar.closest('tr');
      tr.querySelector('.tipos-nome-text').classList.add('hidden');
      tr.querySelector('.tipos-nome-edit').classList.remove('hidden');
      btnEditar.classList.add('hidden');
      tr.querySelector('.btn-salvar-tipo').classList.remove('hidden');
      tr.querySelector('.tipos-nome-edit').focus();
      return;
    }

    if (btnSalvar) {
      const id = btnSalvar.dataset.id;
      const tr = btnSalvar.closest('tr');
      const novoNome = String(tr.querySelector('.tipos-nome-edit')?.value || '').trim();
      if (!novoNome) return;
      if (status) status.textContent = 'Salvando...';
      try {
        await window.Auth.apiJson(`/tipos-sessao/${encodeURIComponent(id)}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ nome: novoNome }),
        });
        await carregarTiposSessaoAdmin();
        if (status) status.textContent = 'Tipo atualizado com sucesso.';
      } catch (err) {
        if (status) status.textContent = err.message;
      }
      return;
    }

    if (btnExcluir) {
      const id = btnExcluir.dataset.id;
      if (!confirm('Excluir este tipo de sessão? Tipos em uso não podem ser removidos.')) return;
      if (status) status.textContent = 'Excluindo...';
      try {
        await window.Auth.apiJson(`/tipos-sessao/${encodeURIComponent(id)}`, { method: 'DELETE' });
        await carregarTiposSessaoAdmin();
        if (status) status.textContent = 'Tipo excluído com sucesso.';
      } catch (err) {
        if (status) status.textContent = err.message;
      }
    }
  });
}

// ─── Preenche o formulário com os valores vindos da API ───────────────────────

function preencherFormulario(configs) {
  _configs = configs;

  for (const cfg of configs) {
    const el = getEl(cfg.chave);
    if (!el) continue;

    if (cfg.tipo === 'boolean') {
      el.checked = cfg.valor === 'true';
    } else {
      el.value = cfg.valor;
    }

    // Preenche dica
    const hint = getEl(`desc_${cfg.chave}`);
    if (hint) hint.textContent = cfg.descricao || '';
  }

  atualizarPreviewFacial();
}

// ─── Lê os valores atuais do formulário ───────────────────────────────────────

function lerFormulario() {
  const pares = [];

  for (const cfg of _configs) {
    const el = getEl(cfg.chave);
    if (!el) continue;

    const valor = cfg.tipo === 'boolean'
      ? String(el.checked)
      : String(el.value).trim();

    pares.push({ chave: cfg.chave, valor });
  }

  return pares;
}

function validarConfiguracoes(pares) {
  const mapa = new Map(pares.map((item) => [item.chave, item.valor]));
  const regrasInteiras = [
    ['min_checkout_intervalo_seg', 1, 7200],
    ['cooldown_entre_tentativas_ms', 1000, 60000],
    ['atraso_pos_piscada_ms', 0, 5000],
    ['frames_fechado_min', 1, 10],
    ['frames_aberto_min', 1, 10],
    ['limite_exportacao', 100, 100000],
    ['ttl_token_horas', 1, 720],
  ];

  for (const [chave, min, max] of regrasInteiras) {
    if (!mapa.has(chave)) continue;
    const valor = Number(mapa.get(chave));
    if (!Number.isFinite(valor)) throw new Error(`Valor inválido em ${chave}.`);
    if (valor < min || valor > max) throw new Error(`O campo ${chave} deve estar entre ${min} e ${max}.`);
  }

  const earFechado = Number(mapa.get('ear_fechado'));
  const earAberto = Number(mapa.get('ear_aberto'));
  if (Number.isFinite(earFechado) && Number.isFinite(earAberto) && earFechado >= earAberto) {
    throw new Error('EAR olho fechado deve ser menor que EAR olho aberto.');
  }
}

// ─── Carrega configurações do backend ────────────────────────────────────────

async function carregarConfiguracoes() {
  setStatus('configStatusGlobal', 'Carregando configurações...');
  try {
    const json = await window.Auth.apiJson('/admin/configuracoes');
    preencherFormulario(Array.isArray(json?.data) ? json.data : []);
    setStatus('configStatusGlobal', '');
  } catch (err) {
    setStatus('configStatusGlobal', `Erro ao carregar: ${err.message}`, 'erro');
  }
}

// ─── Salva todas as configurações ────────────────────────────────────────────

getEl('configForm')?.addEventListener('submit', async (e) => {
  e.preventDefault();

  const salvarBtn = getEl('salvarBtn');
  if (salvarBtn) salvarBtn.disabled = true;
  setStatus('configStatusGlobal', 'Salvando...');

  try {
    const pares = lerFormulario();
    if (pares.length === 0) {
      throw new Error('Nenhuma configuração disponível para salvar. Recarregue a página.');
    }
    validarConfiguracoes(pares);

    const json = await window.Auth.apiJson('/admin/configuracoes', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(pares),
    });
    setStatus('configStatusGlobal', json?.message || 'Configurações salvas.', 'ok');
    // Recarrega do servidor para confirmar
    await carregarConfiguracoes();
  } catch (err) {
    console.error('[config] Erro ao salvar configurações:', err);
    setStatus('configStatusGlobal', err.message, 'erro');
  } finally {
    if (salvarBtn) salvarBtn.disabled = false;
  }
});

// ─── Descarta alterações —- recarrega do backend ─────────────────────────────

getEl('resetBtn')?.addEventListener('click', async () => {
  await carregarConfiguracoes();
  setStatus('configStatusGlobal', 'Alterações descartadas.');
  atualizarPreviewFacial();
});

// ─── Init ─────────────────────────────────────────────────────────────────────

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

  // Filtra links do menu pelo papel do user
  document.querySelectorAll('.sidebar-link[data-roles]').forEach((link) => {
    const roles = link.getAttribute('data-roles').split(',');
    if (!roles.includes(user.perfil_acesso)) link.style.display = 'none';
  });

  await carregarConfiguracoes();
  iniciarInteracoesPreview();
  iniciarInteracoesTiposSessao();
  await carregarTiposSessaoAdmin();
  atualizarPreviewFacial();
}());
