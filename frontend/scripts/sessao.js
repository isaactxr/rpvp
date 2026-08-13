'use strict';

/**
 * Módulo da tela de sessão.
 *
 * Controla operação facial por sessão, acompanhamento em tempo real,
 * início/encerramento da sessão e exportações de acompanhamento.
 */

const API_BASE_DINAMICA = (window.Auth && typeof window.Auth.getApiBase === 'function')
  ? window.Auth.getApiBase()
  : `${window.location.protocol === 'https:' ? 'https:' : 'http:'}//${window.location.hostname || 'localhost'}:3000`;

const APP_TIMEZONE = 'America/Sao_Paulo';

const CONFIG = {
  API_BASE_URL: API_BASE_DINAMICA,
  BACKEND_URL: `${API_BASE_DINAMICA}/reconhecer`,
  EAR_FECHADO: 0.2,
  EAR_ABERTO: 0.25,
  // Valor default alinhado ao backend e sobrescrito por /config/publica quando disponível.
  COOLDOWN_MS: 10000,
  ATRASO_POS_PISCADA_MS: 700,
  MARGEM_X: 0.25,
  MARGEM_Y: 0.22,
  MIN_FACE_AREA_RATIO: 0.06,
  FRAMES_FECHADO_MIN: 2,
  FRAMES_ABERTO_MIN: 2,
  FACE_MESH_INTERVAL_MS: 100,
  CONTROLE_SESSAO_TIMEOUT_MS: 15000,
  RECONHECIMENTO_TIMEOUT_MS: 20000,
  MP_VERSION: '0.4.1633559619',
  OLHO_DIREITO: [33, 160, 158, 133, 153, 144],
  OLHO_ESQUERDO: [362, 385, 387, 263, 373, 380],
  FACE_OVAL: [
    10, 338, 297, 332, 284, 251, 389, 356, 454, 323, 361, 288,
    397, 365, 379, 378, 400, 377, 152, 148, 176, 149, 150, 136,
    172, 58, 132, 93, 234, 127, 162, 21, 54, 103, 67, 109,
  ],
};

const STATUS_COR = {
  info: '#ffffff',
  pronto: '#ffffff',
  aviso: '#ffffff',
  captura: '#ffffff',
  envio: '#ffffff',
  sucesso: '#ffffff',
  confirmado: '#22c55e',
  atencao: '#EA8C1D',
  erro: '#f87171',
};

const DOM = {
  sessaoTitulo: document.getElementById('sessaoTitulo'),
  sessaoSubtitulo: document.getElementById('sessaoSubtitulo'),
  sessaoExecucaoInfo: document.getElementById('sessaoExecucaoInfo'),
  acompanhamentoStatus: document.getElementById('acompanhamentoStatus'),
  acompanhamentoBody: document.getElementById('acompanhamentoBody'),
  sessionHint: document.getElementById('sessionHint'),
  iniciarSessaoBtn: document.getElementById('iniciarSessaoBtn'),
  encerrarSessaoBtn: document.getElementById('encerrarSessaoBtn'),
  sessaoControleCard: document.getElementById('sessaoControleCard'),
  sessaoFaceCard: document.getElementById('sessaoFaceCard'),
  exportSessaoPdfBtn: document.getElementById('exportSessaoPdfBtn'),
  exportSessaoExcelBtn: document.getElementById('exportSessaoExcelBtn'),
  trocarCameraBtn: document.getElementById('trocarCameraBtn'),

  video: document.getElementById('video'),
  canvas: document.getElementById('canvasOverlay'),
  statusText: document.getElementById('statusText'),
  statusBar: document.getElementById('statusBar'),
  earValue: document.getElementById('earValue'),
  videoWrapper: document.getElementById('videoWrapper'),
};

const ctx = DOM.canvas?.getContext('2d');

const state = {
  user: null,
  sessaoId: null,
  sessao: null,
  podeControlarSessao: false,
  podeExportarSessao: false,
  cameraFacingMode: 'user',
  cameraOrientation: null,
  cameraReconfigTimer: null,
  processando: false,
  controleSessaoEmAndamento: false,
  deteccaoPausada: false,
  deteccaoAtiva: true,
  olhoFechado: false,
  ultimaCaptura: 0,
  framesFechado: 0,
  framesAberto: 0,
};

function isPortraitViewport() {
  return window.matchMedia('(orientation: portrait)').matches || window.innerHeight >= window.innerWidth;
}

function obterOrientacaoAtualCamera() {
  return isPortraitViewport() ? 'portrait' : 'landscape';
}

function obterRestricoesVideoPorOrientacao() {
  const portrait = isPortraitViewport();
  const facingMode = state.cameraFacingMode === 'environment'
    ? { ideal: 'environment' }
    : { ideal: 'user' };

  const base = {
    facingMode,
    frameRate: { ideal: 30 },
  };

  if (dispositivoMovelProvavel()) {
    return portrait
      ? {
          ...base,
          width: { ideal: 720 },
          height: { ideal: 960 },
          aspectRatio: { ideal: 3 / 4 },
        }
      : {
          ...base,
          width: { ideal: 1280 },
          height: { ideal: 960 },
          aspectRatio: { ideal: 4 / 3 },
        };
  }

  return portrait
    ? {
        ...base,
        width: { ideal: 720 },
        height: { ideal: 1280 },
      }
    : {
        ...base,
        width: { ideal: 1280 },
        height: { ideal: 720 },
      };
}

function dispositivoMovelProvavel() {
  const ua = String(navigator.userAgent || '');
  const uaMovel = /Android|iPhone|iPad|iPod|IEMobile|Mobile|Opera Mini|webOS|BlackBerry/i.test(ua);

  const uaDesktop = /Windows NT|Macintosh|X11|Linux x86_64/i.test(ua);
  const maxTouchPoints = Number(navigator.maxTouchPoints || 0);
  const menorLadoTela = Math.min(Number(window.screen?.width || 0), Number(window.screen?.height || 0));
  const touchCompactoSemDesktop = !uaDesktop && maxTouchPoints > 0 && menorLadoTela > 0 && menorLadoTela <= 1024;

  return uaMovel || touchCompactoSemDesktop;
}

function podeAlternarCamera() {
  return Boolean(
    dispositivoMovelProvavel()
    && navigator.mediaDevices
    && typeof navigator.mediaDevices.getUserMedia === 'function'
  );
}

function atualizarTextoBotaoTrocaCamera() {
  if (!DOM.trocarCameraBtn) return;
  DOM.trocarCameraBtn.textContent = state.cameraFacingMode === 'environment'
    ? 'Usar câmera frontal'
    : 'Usar câmera traseira';
}

async function alternarCameraMobile() {
  if (!DOM.trocarCameraBtn) return;

  const facingAnterior = state.cameraFacingMode;
  const proximoFacing = facingAnterior === 'environment' ? 'user' : 'environment';
  DOM.trocarCameraBtn.disabled = true;
  state.cameraFacingMode = proximoFacing;
  atualizarTextoBotaoTrocaCamera();

  try {
    await iniciarCamera();
    setStatus(
      proximoFacing === 'environment' ? 'Câmera traseira ativada.' : 'Câmera frontal ativada.',
      'info'
    );
  } catch (_err) {
    state.cameraFacingMode = facingAnterior;
    atualizarTextoBotaoTrocaCamera();
    try {
      await iniciarCamera();
    } catch (__err) {
      // Mantém status de erro amigável mesmo que não consiga restaurar imediatamente.
    }
    setStatus('Não foi possível alternar a câmera neste dispositivo.', 'atencao');
  } finally {
    DOM.trocarCameraBtn.disabled = false;
  }
}

function aplicarAspectRatioDaViewport() {
  if (!DOM.videoWrapper) return;
  const mobile = dispositivoMovelProvavel();
  const portrait = isPortraitViewport();

  if (mobile && portrait) {
    DOM.videoWrapper.classList.add('is-mobile-portrait');
    DOM.videoWrapper.classList.remove('is-mobile-landscape');
    DOM.videoWrapper.style.aspectRatio = '3 / 4';
    DOM.videoWrapper.style.maxHeight = '88vh';
    return;
  }

  if (mobile && !portrait) {
    DOM.videoWrapper.classList.remove('is-mobile-portrait');
    DOM.videoWrapper.classList.add('is-mobile-landscape');
    DOM.videoWrapper.style.aspectRatio = '4 / 3';
    DOM.videoWrapper.style.maxHeight = '74vh';
    return;
  }

  DOM.videoWrapper.classList.remove('is-mobile-portrait', 'is-mobile-landscape');
  DOM.videoWrapper.style.removeProperty('max-height');

  const largura = Number(DOM.video?.videoWidth || 0);
  const altura = Number(DOM.video?.videoHeight || 0);

  if (largura > 0 && altura > 0) {
    DOM.videoWrapper.style.aspectRatio = `${largura} / ${altura}`;
    return;
  }

  DOM.videoWrapper.style.aspectRatio = isPortraitViewport() ? '3 / 4' : '4 / 3';
}

function pararCameraAtual() {
  const stream = DOM.video?.srcObject;
  if (stream && typeof stream.getTracks === 'function') {
    stream.getTracks().forEach((track) => {
      try {
        track.stop();
      } catch (_err) {
        // Ignora erro de encerramento de track para evitar quebra da UI.
      }
    });
  }

  if (DOM.video) {
    DOM.video.srcObject = null;
  }
}

async function reconfigurarCameraSeNecessario() {
  const proximaOrientacao = obterOrientacaoAtualCamera();
  if (state.cameraOrientation === proximaOrientacao) return;
  if (!DOM.video?.srcObject) return;

  state.cameraOrientation = proximaOrientacao;
  aplicarAspectRatioDaViewport();

  try {
    await iniciarCamera();
  } catch (_err) {
    setStatus('Nao foi possivel ajustar a camera para a nova orientacao.', 'atencao');
  }
}

function registrarEventosDeOrientacaoCamera() {
  const agendarReconfiguracao = () => {
    if (state.cameraReconfigTimer) {
      clearTimeout(state.cameraReconfigTimer);
    }

    state.cameraReconfigTimer = setTimeout(() => {
      state.cameraReconfigTimer = null;
      reconfigurarCameraSeNecessario();
    }, 220);
  };

  window.addEventListener('orientationchange', agendarReconfiguracao);
  window.addEventListener('resize', agendarReconfiguracao);
}

function getSessaoIdFromQuery() {
  const params = new URLSearchParams(window.location.search || '');
  const raw = String(params.get('id') || '').trim();
  const id = Number(raw);
  return Number.isInteger(id) && id > 0 ? id : null;
}

function formatarDataHora(valor) {
  if (!valor) return '-';
  const dt = new Date(valor);
  return Number.isNaN(dt.getTime()) ? String(valor) : dt.toLocaleString('pt-BR', { timeZone: APP_TIMEZONE });
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

function montarNomeSessao(sessao) {
  const tipo = String(sessao?.tipo_sessao || sessao?.nome || 'Sessão').trim();
  const local = String(sessao?.local || 'Sem local').trim();
  return `${tipo} - ${local}`;
}

function setStatus(msg, tipo = 'info') {
  if (!DOM.statusText || !DOM.statusBar) return;
  DOM.statusText.textContent = msg;
  DOM.statusBar.style.color = STATUS_COR[tipo] ?? '#ffffff';
}

function formatarDuracaoMinSeg(totalSegundos) {
  const total = Math.max(0, Number(totalSegundos) || 0);
  const minutos = Math.floor(total / 60);
  const segundos = total % 60;
  return `${String(minutos).padStart(2, '0')}:${String(segundos).padStart(2, '0')}`;
}

function aplicarConfigPublica(data) {
  if (!data || typeof data !== 'object') return;
  const mapa = {
    ear_fechado: 'EAR_FECHADO',
    ear_aberto: 'EAR_ABERTO',
    area_minima_rosto: 'MIN_FACE_AREA_RATIO',
    frames_fechado_min: 'FRAMES_FECHADO_MIN',
    frames_aberto_min: 'FRAMES_ABERTO_MIN',
    cooldown_entre_tentativas_ms: 'COOLDOWN_MS',
    atraso_pos_piscada_ms: 'ATRASO_POS_PISCADA_MS',
  };

  for (const [chave, campo] of Object.entries(mapa)) {
    if (chave in data && typeof data[chave] === 'number') {
      CONFIG[campo] = data[chave];
    }
  }
}

async function carregarSessao() {
  const json = await window.Auth.apiJson('/sessoes');
  const lista = Array.isArray(json?.data) ? json.data : [];
  const sessao = lista.find((item) => Number(item.id) === Number(state.sessaoId));

  if (!sessao) {
    throw new Error('Sessão não encontrada.');
  }

  state.sessao = sessao;
  const titulo = montarNomeSessao(sessao);
  if (DOM.sessaoTitulo) DOM.sessaoTitulo.textContent = titulo;
  if (DOM.sessaoSubtitulo) {
    DOM.sessaoSubtitulo.textContent = `Sessão ID ${sessao.id} | Início efetivo: ${formatarDataHora(sessao.inicio_efetivo_em)} | Encerramento: ${formatarDataHora(sessao.fim_efetivo_em)}`;
  }
  if (DOM.sessionHint) {
    DOM.sessionHint.textContent = `Registros vinculados à sessão ${titulo}.`;
  }

  atualizarControlesExecucao();
}

function atualizarControlesExecucao() {
  const sessao = state.sessao;
  const podeControlar = state.podeControlarSessao;

  DOM.iniciarSessaoBtn?.classList.add('hidden');
  DOM.encerrarSessaoBtn?.classList.toggle('hidden', !podeControlar);

  if (!sessao) {
    if (DOM.iniciarSessaoBtn) DOM.iniciarSessaoBtn.disabled = true;
    if (DOM.encerrarSessaoBtn) DOM.encerrarSessaoBtn.disabled = true;
    if (DOM.sessaoExecucaoInfo) DOM.sessaoExecucaoInfo.textContent = 'Sessão não carregada.';
    return;
  }

  if (DOM.sessaoExecucaoInfo) {
    DOM.sessaoExecucaoInfo.textContent = `Efetivo: início ${formatarDataHora(sessao.inicio_efetivo_em)} | encerramento ${formatarDataHora(sessao.fim_efetivo_em)}`;
  }

  const iniciou = Boolean(sessao.inicio_efetivo_em);
  const encerrou = Boolean(sessao.fim_efetivo_em);
  if (DOM.iniciarSessaoBtn) DOM.iniciarSessaoBtn.disabled = true;
  if (DOM.encerrarSessaoBtn) DOM.encerrarSessaoBtn.disabled = !podeControlar || !iniciou || encerrou;
}

async function executarControleSessao(acao) {
  if (state.controleSessaoEmAndamento) return;

  const endpoint = acao === 'iniciar' ? 'iniciar' : 'encerrar';
  const pausaDeteccao = acao === 'encerrar';
  const timeout = criarTimeoutSignal(
    CONFIG.CONTROLE_SESSAO_TIMEOUT_MS,
    acao === 'iniciar'
      ? 'Tempo limite ao iniciar sessao.'
      : 'Tempo limite ao encerrar sessao.'
  );

  state.controleSessaoEmAndamento = true;
  if (pausaDeteccao) {
    state.deteccaoPausada = true;
    state.processando = false;
  }
  if (DOM.iniciarSessaoBtn) DOM.iniciarSessaoBtn.disabled = true;
  if (DOM.encerrarSessaoBtn) DOM.encerrarSessaoBtn.disabled = true;
  if (DOM.acompanhamentoStatus) {
    DOM.acompanhamentoStatus.textContent = acao === 'iniciar' ? 'Iniciando sessão...' : 'Encerrando sessão...';
  }

  try {
    await window.Auth.apiJson(`/sessoes/${encodeURIComponent(state.sessaoId)}/${endpoint}`, {
      method: 'POST',
      signal: timeout.signal,
    });
    await carregarSessao();
    await carregarAcompanhamento();
    if (DOM.acompanhamentoStatus) {
      DOM.acompanhamentoStatus.textContent = 'Sessão atualizada com sucesso.';
    }
  } catch (err) {
    const mensagem = err.name === 'AbortError'
      ? timeout.signal.reason?.message || 'Tempo limite ao atualizar sessao.'
      : err.message;
    if (DOM.acompanhamentoStatus) DOM.acompanhamentoStatus.textContent = mensagem;
  } finally {
    timeout.finalizar();
    state.controleSessaoEmAndamento = false;
    if (!state.sessao?.fim_efetivo_em) {
      state.deteccaoPausada = false;
    }
    atualizarControlesExecucao();
  }
}

function renderAcompanhamentoVazio(msg) {
  if (!DOM.acompanhamentoBody) return;
  DOM.acompanhamentoBody.innerHTML = `<tr><td colspan="5" class="empty">${msg}</td></tr>`;
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

async function abrirFotosDoRegistro(item) {
  const presencaId = Number(item?.presenca_id);
  if (!Number.isInteger(presencaId) || presencaId <= 0) {
    throw new Error('Registro de presença inválido para abrir foto.');
  }

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

async function carregarAcompanhamento() {
  try {
    const json = await window.Auth.apiJson(`/sessoes/${encodeURIComponent(state.sessaoId)}/acompanhamento`);
    const lista = Array.isArray(json?.data) ? json.data : [];

    DOM.acompanhamentoBody.innerHTML = '';
    if (lista.length === 0) {
      renderAcompanhamentoVazio('Sem registros para esta sessão.');
    } else {
      lista.forEach((item) => {
        const possuiFotos = Boolean(item.tem_foto_checkin || item.tem_foto_checkout);
        const tr = document.createElement('tr');
        tr.innerHTML = `
          <td>${item.nome_completo || '-'}</td>
          <td><span class="${statusClass(item.status)}">${statusLabel(item.status)}</span></td>
          <td class="mono">${formatarDataHora(item.check_in_em)}</td>
          <td class="mono">${formatarDataHora(item.check_out_em)}</td>
          <td>${possuiFotos ? '<button type="button" class="ghost-btn btn-ver-fotos">Ver foto(s)</button>' : 'Sem foto'}</td>
        `;

        const btnVerFotos = tr.querySelector('.btn-ver-fotos');
        if (btnVerFotos) {
          btnVerFotos.addEventListener('click', async () => {
            try {
              await abrirFotosDoRegistro(item);
            } catch (err) {
              if (DOM.acompanhamentoStatus) DOM.acompanhamentoStatus.textContent = err.message;
            }
          });
        }

        DOM.acompanhamentoBody.appendChild(tr);
      });
    }

    if (DOM.acompanhamentoStatus) {
      DOM.acompanhamentoStatus.textContent = `${lista.length} registro(s) monitorado(s).`;
    }
  } catch (err) {
    renderAcompanhamentoVazio('Falha ao carregar acompanhamento.');
    if (DOM.acompanhamentoStatus) DOM.acompanhamentoStatus.textContent = err.message;
  }
}

function dist(a, b) {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

function calcularEAR(landmarks, indices) {
  const [i1, i2, i3, i4, i5, i6] = indices;
  const v1 = dist(landmarks[i2], landmarks[i6]);
  const v2 = dist(landmarks[i3], landmarks[i5]);
  const h = dist(landmarks[i1], landmarks[i4]);
  return (v1 + v2) / (2.0 * h);
}

function detectarPiscada(earMedio) {
  if (earMedio < CONFIG.EAR_FECHADO) {
    state.framesFechado += 1;
    state.framesAberto = 0;
    if (state.framesFechado >= CONFIG.FRAMES_FECHADO_MIN) {
      state.olhoFechado = true;
    }
    return false;
  }

  if (earMedio > CONFIG.EAR_ABERTO) {
    state.framesAberto += 1;
    state.framesFechado = 0;

    if (state.olhoFechado && state.framesAberto >= CONFIG.FRAMES_ABERTO_MIN) {
      state.olhoFechado = false;
      state.framesAberto = 0;
      return true;
    }

    return false;
  }

  state.framesFechado = 0;
  state.framesAberto = 0;
  return false;
}

function rostoEstaCentralizado(landmarks) {
  const n = landmarks[1];
  return (
    n.x > CONFIG.MARGEM_X && n.x < 1 - CONFIG.MARGEM_X &&
    n.y > CONFIG.MARGEM_Y && n.y < 1 - CONFIG.MARGEM_Y
  );
}

function toPixel(lm) {
  const espelhar = state.cameraFacingMode !== 'environment';
  return {
    x: (espelhar ? (1 - lm.x) : lm.x) * DOM.canvas.width,
    y: lm.y * DOM.canvas.height,
  };
}

function atualizarEspelhamentoVideo() {
  if (!DOM.video) return;
  DOM.video.classList.toggle('is-mirrored', state.cameraFacingMode !== 'environment');
}

function obterRestricoesFallbackPorOrientacao() {
  const portrait = isPortraitViewport();
  const facingMode = state.cameraFacingMode === 'environment'
    ? { ideal: 'environment' }
    : { ideal: 'user' };

  return {
    facingMode,
    aspectRatio: { ideal: portrait ? (3 / 4) : (4 / 3) },
    frameRate: { ideal: 30 },
  };
}

function obterCandidatosRestricoesVideo() {
  const facingMode = state.cameraFacingMode === 'environment'
    ? { ideal: 'environment' }
    : { ideal: 'user' };
  const portrait = isPortraitViewport();
  const mobile = dispositivoMovelProvavel();

  const candidatos = [obterRestricoesVideoPorOrientacao()];

  if (mobile && portrait) {
    candidatos.push({
      facingMode,
      width: { ideal: 720 },
      height: { ideal: 960 },
      aspectRatio: { exact: 3 / 4 },
      frameRate: { ideal: 30 },
    });
    candidatos.push({
      facingMode,
      width: { ideal: 720 },
      height: { ideal: 1280 },
      aspectRatio: { exact: 9 / 16 },
      frameRate: { ideal: 30 },
    });
    candidatos.push({
      facingMode,
      width: { ideal: 720 },
      height: { ideal: 960 },
      aspectRatio: { ideal: 3 / 4 },
      frameRate: { ideal: 30 },
    });
    candidatos.push({
      facingMode,
      width: { ideal: 720 },
      height: { ideal: 1280 },
      aspectRatio: { ideal: 9 / 16 },
      frameRate: { ideal: 30 },
    });
  } else if (mobile) {
    candidatos.push({
      facingMode,
      width: { ideal: 1280 },
      height: { ideal: 960 },
      aspectRatio: { exact: 4 / 3 },
      frameRate: { ideal: 30 },
    });
    candidatos.push({
      facingMode,
      width: { ideal: 1280 },
      height: { ideal: 960 },
      aspectRatio: { ideal: 4 / 3 },
      frameRate: { ideal: 30 },
    });
  }

  candidatos.push(obterRestricoesFallbackPorOrientacao());
  candidatos.push({ facingMode });
  return candidatos;
}

function streamCombinaOrientacaoDesejada(stream) {
  if (!dispositivoMovelProvavel()) return true;

  const trilha = stream?.getVideoTracks?.()[0];
  if (!trilha || typeof trilha.getSettings !== 'function') return true;

  const settings = trilha.getSettings() || {};
  const largura = Number(settings.width || 0);
  const altura = Number(settings.height || 0);
  if (largura <= 0 || altura <= 0) return true;

  const portrait = isPortraitViewport();
  return portrait ? altura >= largura : largura >= altura;
}

async function normalizarZoomTrack(stream) {
  const trilha = stream?.getVideoTracks?.()[0];
  if (!trilha || typeof trilha.getCapabilities !== 'function' || typeof trilha.applyConstraints !== 'function') {
    return;
  }

  const capacidades = trilha.getCapabilities() || {};
  const zoom = capacidades.zoom;
  if (!zoom || typeof zoom !== 'object') {
    return;
  }

  const min = Number(zoom.min);
  const max = Number(zoom.max);
  if (!Number.isFinite(min) || !Number.isFinite(max)) {
    return;
  }

  const alvo = Math.min(max, Math.max(min, 1));
  try {
    await trilha.applyConstraints({ advanced: [{ zoom: alvo }] });
  } catch (_err) {
    // Nem todos os navegadores permitem ajustar zoom por constraint.
  }
}

function desenharContornoOlhoPontilhado(landmarks, indices, cor) {
  const pontos = indices.map((indice) => toPixel(landmarks[indice]));
  if (pontos.length < 3) return;

  ctx.save();
  ctx.beginPath();
  ctx.moveTo(pontos[0].x, pontos[0].y);
  for (let i = 1; i < pontos.length; i += 1) {
    ctx.lineTo(pontos[i].x, pontos[i].y);
  }
  ctx.closePath();

  ctx.setLineDash([5, 4]);
  ctx.lineWidth = 1.5;
  ctx.strokeStyle = cor;
  ctx.stroke();

  // Preenchimento sutil para reforçar o tracking sem poluir o vídeo.
  ctx.fillStyle = cor === '#22c55e' ? 'rgba(34, 197, 94, 0.08)' : 'rgba(245, 158, 11, 0.08)';
  ctx.fill();

  ctx.setLineDash([]);
  ctx.fillStyle = cor;
  pontos.forEach((ponto) => {
    ctx.beginPath();
    ctx.arc(ponto.x, ponto.y, 2.2, 0, Math.PI * 2);
    ctx.fill();
  });
  ctx.restore();
}

function desenharOverlay(landmarks, valido) {
  // Overlay dinâmico desativado a pedido do usuário.
  ctx.clearRect(0, 0, DOM.canvas.width, DOM.canvas.height);
}

function rostoTemTamanhoMinimo(landmarks) {
  const pontos = CONFIG.FACE_OVAL.map((i) => landmarks[i]);
  const xs = pontos.map((p) => p.x);
  const ys = pontos.map((p) => p.y);

  const larguraN = Math.max(...xs) - Math.min(...xs);
  const alturaN = Math.max(...ys) - Math.min(...ys);
  const areaN = larguraN * alturaN;

  return areaN >= CONFIG.MIN_FACE_AREA_RATIO;
}

async function capturarImagem() {
  const tmp = document.createElement('canvas');
  tmp.width = DOM.video.videoWidth;
  tmp.height = DOM.video.videoHeight;
  tmp.getContext('2d').drawImage(DOM.video, 0, 0);

  return new Promise((resolve, reject) => {
    tmp.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error('toBlob retornou null'))),
      'image/jpeg',
      0.92
    );
  });
}

function esperar(ms) {
  return new Promise((resolve) => setTimeout(resolve, Math.max(0, Number(ms) || 0)));
}

function criarTimeoutSignal(ms, mensagem) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => {
    controller.abort(new Error(mensagem));
  }, Math.max(1, Number(ms) || 1));

  return {
    signal: controller.signal,
    finalizar: () => clearTimeout(timeoutId),
  };
}

async function enviarImagem(blob) {
  const body = new FormData();
  body.append('file', blob, 'face.jpg');
  body.append('tipoRegistro', 'auto');
  body.append('sessaoId', String(state.sessaoId));

  const timeout = criarTimeoutSignal(
    CONFIG.RECONHECIMENTO_TIMEOUT_MS,
    'Tempo limite ao processar reconhecimento facial.'
  );
  let res;

  try {
    res = await window.Auth.authFetch(CONFIG.BACKEND_URL, {
      method: 'POST',
      body,
      signal: timeout.signal,
    });
  } catch (err) {
    if (err.name === 'AbortError') {
      throw new Error(timeout.signal.reason?.message || 'Tempo limite ao processar reconhecimento facial.');
    }
    throw err;
  } finally {
    timeout.finalizar();
  }

  if (!res.ok) {
    let mensagem = `Backend retornou HTTP ${res.status}: ${res.statusText}`;
    try {
      const erroJson = await res.json();
      if (erroJson?.message) mensagem = erroJson.message;
    } catch (_err) {
      // mantém mensagem padrão
    }
    throw new Error(mensagem);
  }

  return res.json();
}

async function onRostoDetectado(results) {
  ctx.clearRect(0, 0, DOM.canvas.width, DOM.canvas.height);

  if (state.deteccaoPausada || state.controleSessaoEmAndamento) {
    return;
  }

  if (!results.multiFaceLandmarks?.length) {
    setStatus('Posicione seu rosto', 'info');
    state.olhoFechado = false;
    state.framesFechado = 0;
    state.framesAberto = 0;
    DOM.earValue.textContent = '—';
    return;
  }

  if (!state.sessao?.id) {
    setStatus('Sessão não carregada', 'erro');
    return;
  }

  if (state.sessao.fim_efetivo_em) {
    state.deteccaoAtiva = false;
    setStatus('Sessão encerrada. Verificação facial desativada.', 'aviso');
    DOM.earValue.textContent = '—';
    return;
  }

  const landmarks = results.multiFaceLandmarks[0];
  const earEsq = calcularEAR(landmarks, CONFIG.OLHO_ESQUERDO);
  const earDir = calcularEAR(landmarks, CONFIG.OLHO_DIREITO);
  const earMed = (earEsq + earDir) / 2;

  DOM.earValue.textContent = earMed.toFixed(3);

  const centralizado = rostoEstaCentralizado(landmarks);
  const tamanhoOk = rostoTemTamanhoMinimo(landmarks);
  const rostoValido = centralizado && tamanhoOk;
  desenharOverlay(landmarks, rostoValido);

  if (state.processando) return;
  if (Date.now() - state.ultimaCaptura < CONFIG.COOLDOWN_MS) return;

  if (!rostoValido) {
    setStatus(tamanhoOk ? 'Centralize o rosto na câmera' : 'Aproxime o rosto da câmera', 'aviso');
    return;
  }

  setStatus('Pisque para registrar', 'pronto');
  if (!detectarPiscada(earMed)) return;

  state.processando = true;
  state.ultimaCaptura = Date.now();

  try {
    const atrasoMs = Math.max(0, Number(CONFIG.ATRASO_POS_PISCADA_MS) || 0);
    if (atrasoMs > 0) {
      setStatus('Capturando...', 'captura');
      await esperar(atrasoMs);
    }

    setStatus('Capturando...', 'captura');
    const blob = await capturarImagem();

    setStatus('Enviando...', 'envio');
    const resposta = await enviarImagem(blob);

    if (resposta?.reconhecido) {
      if (Number(resposta?.tempoRestanteSegundos) > 0) {
        const restanteFmt = formatarDuracaoMinSeg(resposta.tempoRestanteSegundos);
        setStatus(`Aguarde o tempo mínimo para realizar o check-out. ${restanteFmt}`, 'atencao');
      } else if (resposta?.alerta === 'outra_sessao_mesmo_dia') {
        setStatus(String(resposta?.message || 'Tentativa inválida para este dia.'), 'erro');
      } else if (String(resposta?.message || '').startsWith('Presença já registrada')) {
        setStatus(String(resposta?.message || 'Presença já registrada.'), 'erro');
      } else {
        setStatus(String(resposta?.message || 'Presença registrada'), 'confirmado');
      }
      await carregarAcompanhamento();
    } else {
      setStatus(String(resposta?.message || 'Não reconhecido'), 'erro');
    }
  } catch (err) {
    setStatus(err.message || 'Erro ao processar. Tente novamente.', 'erro');
  } finally {
    setTimeout(() => {
      state.processando = false;
    }, CONFIG.COOLDOWN_MS);
  }
}

function atualizarVisibilidadePorEstadoSessao() {
  const encerrou = Boolean(state.sessao?.fim_efetivo_em);
  if (encerrou) {
    state.deteccaoAtiva = false;
    state.deteccaoPausada = true;
    state.processando = false;
  }

  DOM.sessaoControleCard?.classList.toggle('hidden', encerrou);
  DOM.sessaoFaceCard?.classList.toggle('hidden', encerrou);

  if (encerrou && DOM.acompanhamentoStatus) {
    DOM.acompanhamentoStatus.textContent = 'Sessão encerrada. Registro facial desativado.';
  }
}

async function baixarExportacaoSessao(tipo) {
  if (!state.sessaoId) return;
  if (!state.podeExportarSessao) {
    if (DOM.acompanhamentoStatus) {
      DOM.acompanhamentoStatus.textContent = 'Acesso negado: seu perfil não pode exportar esta sessão.';
    }
    return;
  }

  const endpoint = tipo === 'pdf'
    ? `/sessoes/${encodeURIComponent(state.sessaoId)}/acompanhamento/export/pdf`
    : `/sessoes/${encodeURIComponent(state.sessaoId)}/acompanhamento/export/excel`;

  const label = tipo === 'pdf' ? 'PDF' : 'Excel';
  const extensao = tipo === 'pdf' ? 'pdf' : 'xlsx';

  DOM.exportSessaoPdfBtn && (DOM.exportSessaoPdfBtn.disabled = true);
  DOM.exportSessaoExcelBtn && (DOM.exportSessaoExcelBtn.disabled = true);
  if (DOM.acompanhamentoStatus) DOM.acompanhamentoStatus.textContent = `Exportando lista (${label})...`;

  try {
    const response = await window.Auth.authFetch(`${CONFIG.API_BASE_URL}${endpoint}`, { method: 'GET' });
    if (!response.ok) {
      const erro = await response.json().catch(() => ({}));
      throw new Error(erro?.message || `Falha ao exportar ${label}.`);
    }

    const blob = await response.blob();
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `sessao_${state.sessaoId}_presenca.${extensao}`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);

    if (DOM.acompanhamentoStatus) DOM.acompanhamentoStatus.textContent = `Exportação ${label} concluída.`;
  } catch (err) {
    if (DOM.acompanhamentoStatus) DOM.acompanhamentoStatus.textContent = err.message;
  } finally {
    DOM.exportSessaoPdfBtn && (DOM.exportSessaoPdfBtn.disabled = false);
    DOM.exportSessaoExcelBtn && (DOM.exportSessaoExcelBtn.disabled = false);
  }
}

async function iniciarCamera() {
  setStatus('Carregando câmera...', 'info');

  aplicarAspectRatioDaViewport();
  state.cameraOrientation = obterOrientacaoAtualCamera();
  pararCameraAtual();
  atualizarEspelhamentoVideo();

  let stream = null;
  let ultimoErro = null;
  const candidatos = obterCandidatosRestricoesVideo();

  for (const restricoes of candidatos) {
    try {
      const tentativa = await navigator.mediaDevices.getUserMedia({
        video: restricoes,
        audio: false,
      });

      if (!streamCombinaOrientacaoDesejada(tentativa)) {
        try {
          tentativa.getTracks().forEach((track) => track.stop());
        } catch (_err) {
          // Ignora falha ao encerrar tentativa incompatível.
        }
        continue;
      }

      stream = tentativa;
      break;
    } catch (err) {
      ultimoErro = err;
      const nome = String(err?.name || '');
      const erroDeRestricao = nome === 'OverconstrainedError'
        || nome === 'ConstraintNotSatisfiedError'
        || nome === 'NotFoundError'
        || nome === 'DevicesNotFoundError';

      if (!erroDeRestricao) {
        throw err;
      }
    }
  }

  if (!stream) {
    throw ultimoErro || new Error('Nao foi possivel iniciar a camera com as restricoes disponiveis.');
  }

  await normalizarZoomTrack(stream);

  DOM.video.srcObject = stream;
  DOM.video.setAttribute('playsinline', 'true');

  await new Promise((resolve, reject) => {
    DOM.video.onloadedmetadata = () => {
      DOM.video.play().then(() => {
        const vW = DOM.video.videoWidth;
        const vH = DOM.video.videoHeight;
        DOM.canvas.width = vW;
        DOM.canvas.height = vH;
        aplicarAspectRatioDaViewport();
        resolve();
      }).catch(reject);
    };
    DOM.video.onerror = reject;
  });
}

async function detectarRosto() {
  const faceMesh = new FaceMesh({
    locateFile: (file) => `https://cdn.jsdelivr.net/npm/@mediapipe/face_mesh@${CONFIG.MP_VERSION}/${file}`,
  });

  faceMesh.setOptions({
    maxNumFaces: 1,
    refineLandmarks: true,
    minDetectionConfidence: 0.7,
    minTrackingConfidence: 0.7,
  });

  faceMesh.onResults(onRostoDetectado);

  let emEnvio = false;
  let ultimoProcessamento = 0;
  async function loop() {
    if (!state.deteccaoAtiva) {
      try {
        faceMesh.close?.();
      } catch (_err) {
        // ignora falha ao liberar recursos do detector
      }
      return;
    }

    const agora = Date.now();
    const podeProcessarFrame = agora - ultimoProcessamento >= CONFIG.FACE_MESH_INTERVAL_MS;

    if (
      !state.deteccaoPausada
      && !state.controleSessaoEmAndamento
      && !emEnvio
      && podeProcessarFrame
      && DOM.video.readyState >= HTMLMediaElement.HAVE_ENOUGH_DATA
    ) {
      emEnvio = true;
      ultimoProcessamento = agora;
      try {
        await faceMesh.send({ image: DOM.video });
      } catch (_err) {
        // mantém o loop ativo
      } finally {
        emEnvio = false;
      }
    }
    requestAnimationFrame(loop);
  }

  requestAnimationFrame(loop);
}

DOM.encerrarSessaoBtn?.addEventListener('click', async () => {
  await executarControleSessao('encerrar');
  atualizarVisibilidadePorEstadoSessao();
});

DOM.exportSessaoPdfBtn?.addEventListener('click', async () => {
  await baixarExportacaoSessao('pdf');
});

DOM.exportSessaoExcelBtn?.addEventListener('click', async () => {
  await baixarExportacaoSessao('excel');
});

DOM.trocarCameraBtn?.addEventListener('click', async () => {
  await alternarCameraMobile();
});

(async function init() {
  const user = await window.Auth.requireAuth(['admin', 'gestor', 'instrutor', 'colaborador']);
  if (!user) return;

  state.user = user;
  state.podeControlarSessao = ['admin', 'instrutor'].includes(user.perfil_acesso);
  state.podeExportarSessao = ['admin', 'gestor', 'instrutor'].includes(user.perfil_acesso);

  DOM.exportSessaoPdfBtn?.classList.toggle('hidden', !state.podeExportarSessao);
  DOM.exportSessaoExcelBtn?.classList.toggle('hidden', !state.podeExportarSessao);

  if (DOM.trocarCameraBtn) {
    const exibirTroca = podeAlternarCamera();
    DOM.trocarCameraBtn.classList.toggle('hidden', !exibirTroca);
    if (exibirTroca) {
      state.cameraFacingMode = 'user';
      atualizarTextoBotaoTrocaCamera();
    }
  }

  state.sessaoId = getSessaoIdFromQuery();
  if (!state.sessaoId) {
    window.location.href = 'sessoes.html';
    return;
  }

  try {
    const cfgRes = await fetch(`${CONFIG.API_BASE_URL}/config/publica`);
    if (cfgRes.ok) {
      const cfgJson = await cfgRes.json();
      aplicarConfigPublica(cfgJson?.data);
    }
  } catch (_err) {
    // mantém defaults
  }

  try {
    await carregarSessao();
    await carregarAcompanhamento();
    atualizarVisibilidadePorEstadoSessao();

    if (state.sessao?.fim_efetivo_em) {
      return;
    }

    await iniciarCamera();
    registrarEventosDeOrientacaoCamera();
    setStatus('Iniciando detecção...', 'info');
    await detectarRosto();
  } catch (err) {
    if (DOM.sessaoSubtitulo) DOM.sessaoSubtitulo.textContent = err.message;
    if (err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError') {
      setStatus('Permissão de câmera negada', 'erro');
    } else if (err.name === 'NotFoundError' || err.name === 'DevicesNotFoundError') {
      setStatus('Câmera não encontrada', 'erro');
    } else {
      setStatus('Erro ao iniciar câmera ou carregar sessão.', 'erro');
    }
  }
})();
