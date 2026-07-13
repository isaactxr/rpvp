/**
 * ═══════════════════════════════════════════════════════════════
 * Registro de Presença — Reconhecimento Facial com Piscada
 * ═══════════════════════════════════════════════════════════════
 *
 * Fluxo:
 *   câmera (getUserMedia)
 *     → MediaPipe FaceMesh (loop com requestAnimationFrame)
 *       → EAR médio dos dois olhos
 *         → detecta piscada (transição FECHADO → ABERTO)
 *           → captura frame (canvas temporário)
 *             → POST multipart/form-data → <API_BASE>/reconhecer
 *               → exibe resultado
 *
 * Dependências externas:
 *   - @mediapipe/face_mesh 0.4.1633559619 (carregado via CDN no HTML)
 */

'use strict';

const API_BASE_DINAMICA = (window.Auth && typeof window.Auth.getApiBase === 'function')
  ? window.Auth.getApiBase()
  : `${window.location.protocol === 'https:' ? 'https:' : 'http:'}//${window.location.hostname || 'localhost'}:3000`;

// ═══════════════════════════════════════════════════════════════
// Configurações centralizadas
// ═══════════════════════════════════════════════════════════════

const CONFIG = {

  // ── Detecção de piscada ──────────────────────────────────────
  EAR_FECHADO:   0.20,   // abaixo → olho considerado fechado
  EAR_ABERTO:    0.25,   // acima  → olho considerado aberto

  // ── Cooldown após captura (ms) ───────────────────────────────
  // Valor default alinhado ao backend e sobrescrito por /config/publica quando disponível.
  COOLDOWN_MS:   10000,

  // ── Backend ──────────────────────────────────────────────────
  API_BASE_URL: API_BASE_DINAMICA,
  BACKEND_URL:  `${API_BASE_DINAMICA}/reconhecer`,
  SESSOES_URL:  `${API_BASE_DINAMICA}/sessoes`,

  // ── Centralização (coordenada normalizada 0–1) ───────────────
  // O nariz (landmark 1) deve estar dentro da faixa central.
  MARGEM_X:     0.25,   // entre 0.25 e 0.75 no eixo X
  MARGEM_Y:     0.22,   // entre 0.22 e 0.78 no eixo Y

  // ── Tamanho mínimo de rosto no frame (fração da área total) ─
  // Evita capturar quando o rosto está muito distante da câmera.
  MIN_FACE_AREA_RATIO: 0.06,

  // ── Frames consecutivos para validar estado dos olhos ───────
  FRAMES_FECHADO_MIN: 2,
  FRAMES_ABERTO_MIN:  2,

  // ── Versão do MediaPipe (usada no locateFile) ────────────────
  MP_VERSION:   '0.4.1633559619',

  // ── Landmarks dos olhos para cálculo do EAR ─────────────────
  // Ordem: [P1_canto_ext, P2_sup_ext, P3_sup_int,
  //         P4_canto_int, P5_inf_int, P6_inf_ext]
  // Fórmula: EAR = (||P2–P6|| + ||P3–P5||) / (2 × ||P1–P4||)
  OLHO_DIREITO:  [33,  160, 158, 133, 153, 144],
  OLHO_ESQUERDO: [362, 385, 387, 263, 373, 380],

  // ── Subconjunto do contorno do rosto (para bounding box) ────
  FACE_OVAL: [
    10, 338, 297, 332, 284, 251, 389, 356, 454, 323, 361, 288,
    397, 365, 379, 378, 400, 377, 152, 148, 176, 149, 150, 136,
    172,  58, 132,  93, 234, 127, 162,  21,  54, 103,  67, 109,
  ],
};

// Aplica configurações recebidas do backend (chaves snake_case → camelCase CONFIG)
function aplicarConfigPublica(data) {
  if (!data || typeof data !== 'object') return;
  const mapa = {
    ear_fechado:        'EAR_FECHADO',
    ear_aberto:         'EAR_ABERTO',
    area_minima_rosto:  'MIN_FACE_AREA_RATIO',
    frames_fechado_min: 'FRAMES_FECHADO_MIN',
    frames_aberto_min:  'FRAMES_ABERTO_MIN',
    cooldown_entre_tentativas_ms: 'COOLDOWN_MS',
  };
  for (const [chave, campo] of Object.entries(mapa)) {
    if (chave in data && typeof data[chave] === 'number') {
      CONFIG[campo] = data[chave];
    }
  }
}

// ═══════════════════════════════════════════════════════════════
// Paleta de cores por tipo de status
// ═══════════════════════════════════════════════════════════════

const STATUS_COR = {
  info:    '#ffffff',
  pronto:  '#ffffff',
  aviso:   '#ffffff',
  captura: '#ffffff',
  envio:   '#ffffff',
  sucesso: '#ffffff',
  confirmado: '#22c55e',
  atencao: '#EA8C1D',
  erro:    '#f87171',   // vermelho  — não reconhecido / falha
};

// ═══════════════════════════════════════════════════════════════
// Estado global da aplicação
// ═══════════════════════════════════════════════════════════════

const estado = {
  processando:   false,  // true durante captura + envio (trava disparos duplos)
  olhoFechado:   false,  // flag do último frame: olho estava fechado?
  ultimaCaptura: 0,      // timestamp (ms) da última captura realizada
  framesFechado: 0,      // contador consecutivo de frames com EAR fechado
  framesAberto:  0,      // contador consecutivo de frames com EAR aberto
  cameraOrientation: null,
  cameraReconfigTimer: null,
};

// ═══════════════════════════════════════════════════════════════
// Referências DOM
// ═══════════════════════════════════════════════════════════════

const videoEl          = document.getElementById('video');
const canvasEl         = document.getElementById('canvasOverlay');
const statusTextEl     = document.getElementById('statusText');
const statusBarEl      = document.getElementById('statusBar');
const earValueEl       = document.getElementById('earValue');
const videoWrapper     = document.getElementById('videoWrapper');
const sessionSelectEl  = document.getElementById('sessionSelect');
const sessionHintEl    = document.getElementById('sessionHint');
const reloadSessionsEl = document.getElementById('reloadSessionsBtn');
const ctx              = canvasEl.getContext('2d');

function isPortraitViewport() {
  return window.matchMedia('(orientation: portrait)').matches || window.innerHeight >= window.innerWidth;
}

function obterOrientacaoAtualCamera() {
  return isPortraitViewport() ? 'portrait' : 'landscape';
}

function obterRestricoesVideoPorOrientacao() {
  const portrait = isPortraitViewport();
  return portrait
    ? {
        facingMode: 'user',
        width: { ideal: 720 },
        height: { ideal: 1280 },
        aspectRatio: { ideal: 9 / 16 },
      }
    : {
        facingMode: 'user',
        width: { ideal: 1280 },
        height: { ideal: 720 },
        aspectRatio: { ideal: 16 / 9 },
      };
}

function aplicarAspectRatioDaViewport() {
  if (!videoWrapper) return;
  videoWrapper.style.aspectRatio = isPortraitViewport() ? '9 / 16' : '16 / 9';
}

function pararCameraAtual() {
  const stream = videoEl?.srcObject;
  if (stream && typeof stream.getTracks === 'function') {
    stream.getTracks().forEach((track) => {
      try {
        track.stop();
      } catch (_err) {
        // Ignora erro de fechamento das tracks para manter o fluxo.
      }
    });
  }

  if (videoEl) {
    videoEl.srcObject = null;
  }
}

async function reconfigurarCameraSeNecessario() {
  const proximaOrientacao = obterOrientacaoAtualCamera();
  if (estado.cameraOrientation === proximaOrientacao) return;
  if (!videoEl?.srcObject) return;

  estado.cameraOrientation = proximaOrientacao;
  aplicarAspectRatioDaViewport();

  try {
    await iniciarCamera();
  } catch (_err) {
    setStatus('Nao foi possivel ajustar a camera para a nova orientacao.', 'atencao');
  }
}

function registrarEventosDeOrientacaoCamera() {
  const agendarReconfiguracao = () => {
    if (estado.cameraReconfigTimer) {
      clearTimeout(estado.cameraReconfigTimer);
    }

    estado.cameraReconfigTimer = setTimeout(() => {
      estado.cameraReconfigTimer = null;
      reconfigurarCameraSeNecessario();
    }, 220);
  };

  window.addEventListener('orientationchange', agendarReconfiguracao);
  window.addEventListener('resize', agendarReconfiguracao);
}

// ═══════════════════════════════════════════════════════════════
// Utilitário: status visual
// ═══════════════════════════════════════════════════════════════

/**
 * Atualiza o texto e a cor da barra de status.
 * @param {string} msg  - Mensagem a exibir
 * @param {string} tipo - Chave de STATUS_COR
 */
function setStatus(msg, tipo = 'info') {
  statusTextEl.textContent = msg;
  statusBarEl.style.color  = STATUS_COR[tipo] ?? '#ffffff';
}

function formatarDuracaoMinSeg(totalSegundos) {
  const total = Math.max(0, Number(totalSegundos) || 0);
  const minutos = Math.floor(total / 60);
  const segundos = total % 60;
  return `${String(minutos).padStart(2, '0')}:${String(segundos).padStart(2, '0')}`;
}

const APP_TIMEZONE = 'America/Sao_Paulo';

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

function formatarDataSessao(data) {
  if (!data) return '';
  const soData = String(data).slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(soData)) return String(data);
  const [ano, mes, dia] = soData.split('-');
  return `${dia}/${mes}/${ano}`;
}

function montarLabelSessao(sessao) {
  const partes = [sessao.nome || 'Sessão'];

  if (sessao.tipo_sessao) {
    partes.push(sessao.tipo_sessao);
  }

  if (sessao.data) {
    partes.push(formatarDataSessao(sessao.data));
  }

  if (sessao.horario_inicio) {
    partes.push(sessao.horario_inicio.slice(0, 5));
  }

  return partes.join(' • ');
}

async function carregarSessoes() {
  if (!sessionSelectEl || !sessionHintEl) return;

  const valorAtual = sessionSelectEl.value;
  sessionHintEl.textContent = 'Carregando sessões disponíveis...';
  reloadSessionsEl.disabled = true;

  try {
    const dataHoje = obterDataHojeLocal();
    const json = await window.Auth.apiJson(`/sessoes?data=${encodeURIComponent(dataHoje)}`);
    const lista = Array.isArray(json?.data) ? json.data : [];
    const listaAbertas = lista.filter((sessao) => !sessao?.fim_efetivo_em);

    sessionSelectEl.innerHTML = '<option value="">Selecione uma sessão</option>';

    listaAbertas.forEach((sessao) => {
      const option = document.createElement('option');
      option.value = String(sessao.id);
      option.textContent = montarLabelSessao(sessao);
      sessionSelectEl.appendChild(option);
    });

    sessionSelectEl.disabled = false;
    if (listaAbertas.some((sessao) => String(sessao.id) === valorAtual)) {
      sessionSelectEl.value = valorAtual;
    } else {
      sessionSelectEl.value = '';
    }

    sessionHintEl.textContent = listaAbertas.length > 0
      ? 'Selecione uma sessão não encerrada. A sessão inicia automaticamente na primeira verificação facial.'
      : 'Nenhuma sessão disponível no momento. Não é possível registrar presença sem sessão selecionada.';
  } catch (err) {
    console.error('[sessoes] erro ao carregar:', err);
    sessionHintEl.textContent = 'Não foi possível carregar as sessões agora.';
  } finally {
    reloadSessionsEl.disabled = false;
  }
}

// ═══════════════════════════════════════════════════════════════
// 1. Câmera
// ═══════════════════════════════════════════════════════════════

/**
 * Solicita acesso à câmera (getUserMedia), vincula ao <video> e
 * dimensiona o canvas interno ao tamanho real do stream.
 * Também ajusta o aspect-ratio do wrapper para evitar distorções
 * no overlay de landmarks.
 */
async function iniciarCamera() {
  setStatus('Carregando câmera...', 'info');

  aplicarAspectRatioDaViewport();
  estado.cameraOrientation = obterOrientacaoAtualCamera();
  pararCameraAtual();

  const stream = await navigator.mediaDevices.getUserMedia({
    video: obterRestricoesVideoPorOrientacao(),
    audio: false,
  });

  videoEl.srcObject = stream;

  // Aguarda metadados para obter dimensões reais do stream
  await new Promise((resolve, reject) => {
    videoEl.onloadedmetadata = () => {
      videoEl.play().then(() => {
        const vW = videoEl.videoWidth;
        const vH = videoEl.videoHeight;

        // Dimensões internas do canvas = tamanho real do frame
        canvasEl.width  = vW;
        canvasEl.height = vH;

        // Ajusta aspect-ratio do wrapper ao frame real → sem crop
        aplicarAspectRatioDaViewport();

        resolve();
      }).catch(reject);
    };
    videoEl.onerror = reject;
  });
}

// ═══════════════════════════════════════════════════════════════
// 2. Cálculo EAR (Eye Aspect Ratio)
// ═══════════════════════════════════════════════════════════════

/** Distância euclidiana entre dois landmarks normalizados {x, y}. */
function dist(a, b) {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

/**
 * Calcula o Eye Aspect Ratio de um olho usando 6 landmarks.
 *
 *   EAR = ( ||P2–P6|| + ||P3–P5|| ) / ( 2 × ||P1–P4|| )
 *
 * Referência:
 *   Soukupová & Čech, "Real-Time Eye Blink Detection using
 *   Facial Landmarks", CVWW 2016.
 *
 * @param {Array}    landmarks - Array completo dos 468 landmarks
 * @param {number[]} indices   - [i1..i6] no esquema P1–P6
 * @returns {number} EAR (>0.25 aberto | <0.20 fechado, tipicamente)
 */
function calcularEAR(landmarks, indices) {
  const [i1, i2, i3, i4, i5, i6] = indices;
  const v1 = dist(landmarks[i2], landmarks[i6]); // par vertical externo
  const v2 = dist(landmarks[i3], landmarks[i5]); // par vertical interno
  const h  = dist(landmarks[i1], landmarks[i4]); // eixo horizontal
  return (v1 + v2) / (2.0 * h);
}

// ═══════════════════════════════════════════════════════════════
// 3. Detecção de piscada
// ═══════════════════════════════════════════════════════════════

/**
 * Detecta piscada pela transição de estado: FECHADO → ABERTO.
 * Retorna `true` apenas no frame em que os olhos reabrem após
 * terem estado fechados — evita disparos múltiplos por piscada.
 *
 * @param {number} earMedio - EAR médio dos dois olhos
 * @returns {boolean}
 */
function detectarPiscada(earMedio) {
  if (earMedio < CONFIG.EAR_FECHADO) {
    estado.framesFechado += 1;
    estado.framesAberto = 0;

    if (estado.framesFechado >= CONFIG.FRAMES_FECHADO_MIN) {
      estado.olhoFechado = true;
    }
    return false;
  }

  if (earMedio > CONFIG.EAR_ABERTO) {
    estado.framesAberto += 1;
    estado.framesFechado = 0;

    if (estado.olhoFechado && estado.framesAberto >= CONFIG.FRAMES_ABERTO_MIN) {
      // Olho reabriu após fechar (com estabilidade) → piscada detectada
      estado.olhoFechado = false;
      estado.framesAberto = 0;
      return true;
    }

    return false;
  }

  // Zona intermediária: evita "resets" agressivos por ruído.
  estado.framesFechado = 0;
  estado.framesAberto = 0;

  return false;
}

// ═══════════════════════════════════════════════════════════════
// 4. Validação de centralização do rosto
// ═══════════════════════════════════════════════════════════════

/**
 * Verifica se o nariz (ponta, landmark 1) está na faixa central
 * do frame. Coordenadas normalizadas [0, 1].
 *
 * @param {Array} landmarks
 * @returns {boolean}
 */
function rostoEstaCentralizado(landmarks) {
  const n = landmarks[1]; // ponta do nariz
  return (
    n.x > CONFIG.MARGEM_X && n.x < 1 - CONFIG.MARGEM_X &&
    n.y > CONFIG.MARGEM_Y && n.y < 1 - CONFIG.MARGEM_Y
  );
}

// ═══════════════════════════════════════════════════════════════
// 5. Captura do frame
// ═══════════════════════════════════════════════════════════════

/**
 * Captura o frame atual do <video> em um canvas temporário e
 * retorna um Blob JPEG (qualidade 0.92).
 *
 * O frame é capturado sem espelhamento (raw) → consistente com
 * as imagens de cadastro enviadas ao CompreFace.
 *
 * @returns {Promise<Blob>}
 */
async function capturarImagem() {
  const tmp    = document.createElement('canvas');
  tmp.width    = videoEl.videoWidth;
  tmp.height   = videoEl.videoHeight;
  tmp.getContext('2d').drawImage(videoEl, 0, 0);

  return new Promise((resolve, reject) => {
    tmp.toBlob(
      blob => (blob ? resolve(blob) : reject(new Error('toBlob retornou null'))),
      'image/jpeg',
      0.92,
    );
  });
}

// ═══════════════════════════════════════════════════════════════
// 6. Envio para o backend
// ═══════════════════════════════════════════════════════════════

/**
 * Envia a imagem ao backend via POST multipart/form-data.
 *
 * Endpoint esperado:  POST <API_BASE>/reconhecer
 * Campo do arquivo:   "file"
 * Resposta esperada:  { reconhecido: boolean, nome?: string }
 *
 * @param   {Blob}            blob
 * @returns {Promise<object>} JSON de resposta
 */
async function enviarImagem(blob) {
  const body = new FormData();
  body.append('file', blob, 'face.jpg');
  body.append('tipoRegistro', 'auto');

  if (sessionSelectEl?.value) {
    body.append('sessaoId', sessionSelectEl.value);
  }

  const res = await window.Auth.authFetch(CONFIG.BACKEND_URL, {
    method: 'POST',
    body,
  });

  if (!res.ok) {
    let mensagem = `Backend retornou HTTP ${res.status}: ${res.statusText}`;
    try {
      const erroJson = await res.json();
      if (erroJson?.message) mensagem = erroJson.message;
    } catch (_) {
      // mantém mensagem padrão quando o backend não retorna JSON
    }
    throw new Error(mensagem);
  }

  return res.json();
}

// ═══════════════════════════════════════════════════════════════
// 7. Overlay de debug (landmarks + bounding box)
// ═══════════════════════════════════════════════════════════════

/**
 * Converte landmark normalizado {x, y} para pixel no canvas,
 * aplicando espelhamento horizontal (X invertido) para alinhar
 * o desenho com o vídeo espelhado via CSS (transform: scaleX(-1)).
 *
 * @param   {{ x: number, y: number }} lm
 * @returns {{ x: number, y: number }}
 */
function toPixel(lm) {
  return {
    x: (1 - lm.x) * canvasEl.width,
    y:       lm.y  * canvasEl.height,
  };
}

/**
 * Desenha no canvas de overlay:
 *   - Bounding box do rosto (cor varia conforme centralização)
 *   - Pontos de cada landmark dos olhos (debug EAR)
 *
 * @param {Array}   landmarks
 * @param {boolean} valido - true se rosto está centralizado
 */
function desenharOverlay(landmarks, valido) {
  const W = canvasEl.width;
  const H = canvasEl.height;
  ctx.clearRect(0, 0, W, H);

  const cor = valido ? '#22c55e' : '#f59e0b';

  // ── Bounding box a partir do contorno do rosto ──────────────
  const pontos = CONFIG.FACE_OVAL.map(i => toPixel(landmarks[i]));
  const xs     = pontos.map(p => p.x);
  const ys     = pontos.map(p => p.y);
  const bx     = Math.min(...xs);
  const by     = Math.min(...ys);
  const bw     = Math.max(...xs) - bx;
  const bh     = Math.max(...ys) - by;

  ctx.strokeStyle = cor;
  ctx.lineWidth   = 1.8;
  ctx.strokeRect(bx, by, bw, bh);

  // ── Pontos dos olhos ─────────────────────────────────────────
  ctx.fillStyle = cor;
  [...CONFIG.OLHO_DIREITO, ...CONFIG.OLHO_ESQUERDO].forEach(i => {
    const p = toPixel(landmarks[i]);
    ctx.beginPath();
    ctx.arc(p.x, p.y, 2.4, 0, Math.PI * 2);
    ctx.fill();
  });
}

/**
 * Calcula se o rosto ocupa área mínima no frame.
 *
 * @param {Array} landmarks
 * @returns {boolean}
 */
function rostoTemTamanhoMinimo(landmarks) {
  const pontos = CONFIG.FACE_OVAL.map(i => landmarks[i]);
  const xs = pontos.map(p => p.x);
  const ys = pontos.map(p => p.y);

  const larguraN = Math.max(...xs) - Math.min(...xs);
  const alturaN  = Math.max(...ys) - Math.min(...ys);
  const areaN    = larguraN * alturaN;

  return areaN >= CONFIG.MIN_FACE_AREA_RATIO;
}

// ═══════════════════════════════════════════════════════════════
// 8. Pipeline principal — callback do FaceMesh
// ═══════════════════════════════════════════════════════════════

/**
 * Chamado pelo MediaPipe FaceMesh a cada frame processado.
 * Orquestra: EAR → centralização → piscada → captura → envio.
 *
 * Proteções contra disparos múltiplos:
 *   - estado.processando  → trava enquanto há captura em andamento
 *   - estado.ultimaCaptura → cooldown de COOLDOWN_MS após cada envio
 *
 * @param {object} results - Resultado retornado pelo FaceMesh.send()
 */
async function onRostoDetectado(results) {
  ctx.clearRect(0, 0, canvasEl.width, canvasEl.height);

  // ── Sem rosto ────────────────────────────────────────────────
  if (!results.multiFaceLandmarks?.length) {
    setStatus('Posicione seu rosto', 'info');
    estado.olhoFechado   = false;
    estado.framesFechado = 0;
    estado.framesAberto  = 0;
    earValueEl.textContent = '—';
    return;
  }

  const landmarks = results.multiFaceLandmarks[0];

  if (!sessionSelectEl?.value) {
    setStatus('Selecione uma sessão para realizar a verificação de presença', 'info');
    estado.olhoFechado = false;
    estado.framesFechado = 0;
    estado.framesAberto = 0;
    earValueEl.textContent = '—';
    return;
  }

  // ── EAR médio dos dois olhos ─────────────────────────────────
  const earEsq = calcularEAR(landmarks, CONFIG.OLHO_ESQUERDO);
  const earDir = calcularEAR(landmarks, CONFIG.OLHO_DIREITO);
  const earMed = (earEsq + earDir) / 2;

  earValueEl.textContent = earMed.toFixed(3);

  // ── Overlay de debug ─────────────────────────────────────────
  const centralizado = rostoEstaCentralizado(landmarks);
  const tamanhoOk    = rostoTemTamanhoMinimo(landmarks);
  const rostoValido  = centralizado && tamanhoOk;
  desenharOverlay(landmarks, rostoValido);

  // ── Proteções de estado ──────────────────────────────────────
  if (estado.processando) return;
  if (Date.now() - estado.ultimaCaptura < CONFIG.COOLDOWN_MS) return;

  // ── Rosto fora do centro ─────────────────────────────────────
  if (!rostoValido) {
    if (!tamanhoOk) {
      setStatus('Aproxime o rosto da câmera', 'aviso');
    } else {
      setStatus('Centralize o rosto na câmera', 'aviso');
    }
    estado.olhoFechado = false;
    estado.framesFechado = 0;
    estado.framesAberto = 0;
    return;
  }

  // ── Aguardando piscada ───────────────────────────────────────
  setStatus('Pisque para registrar', 'pronto');

  if (!detectarPiscada(earMed)) return;

  // ════════════════════════════════════════════════════════════
  // PISCADA DETECTADA — inicia pipeline de captura e envio
  // ════════════════════════════════════════════════════════════

  estado.processando   = true;
  estado.ultimaCaptura = Date.now();

  setStatus('Capturando...', 'captura');

  try {
    const blob = await capturarImagem();

    setStatus('Enviando...', 'envio');

    const resposta = await enviarImagem(blob);

    if (resposta?.reconhecido) {
      if (Number(resposta?.tempoRestanteSegundos) > 0) {
        const restanteFmt = formatarDuracaoMinSeg(resposta.tempoRestanteSegundos);
        setStatus(`Aguarde o tempo mínimo para realizar o check-out. ${restanteFmt}`, 'atencao');
      } else if (resposta?.alerta === 'outra_sessao_mesmo_dia') {
        setStatus(String(resposta?.message || 'Tentativa inválida para este dia.'), 'erro');
      } else if (String(resposta?.message || '').startsWith('Presença já registrada em sessão de')) {
        setStatus(resposta.message, 'erro');
      } else if (resposta.tipoRegistro === 'checkin') {
        const nome = String(resposta.user || resposta.nome || 'COLABORADOR IDENTIFICADO').trim();
        setStatus(`Presença registrada - ${nome}`, 'confirmado');
      } else if (resposta.tipoRegistro === 'checkout') {
        const nome = String(resposta.user || resposta.nome || '').trim();
        setStatus(nome ? `Check-out registrado - ${nome}` : 'Check-out registrado', 'sucesso');
      } else {
        setStatus(String(resposta?.message || 'Presença registrada'), 'sucesso');
      }
    } else {
      setStatus(String(resposta?.message || 'Não reconhecido'), 'erro');
    }

  } catch (err) {
    console.error('[presença] Erro no pipeline:', err);
    setStatus('Erro ao processar. Tente novamente.', 'erro');

  } finally {
    // Libera estado.processando após o cooldown.
    // O status atual (sucesso/erro) persiste visualmente até lá.
    setTimeout(() => {
      estado.processando = false;
    }, CONFIG.COOLDOWN_MS);
  }
}

// ═══════════════════════════════════════════════════════════════
// 9. Loop de detecção — MediaPipe FaceMesh
// ═══════════════════════════════════════════════════════════════

/**
 * Inicializa o MediaPipe FaceMesh e inicia o loop de inferência
 * usando requestAnimationFrame.
 *
 * A flag `emEnvio` evita que faceMesh.send() seja chamado enquanto
 * o frame anterior ainda está sendo processado (sem acúmulo de fila).
 */
async function detectarRosto() {
  const faceMesh = new FaceMesh({
    // locateFile aponta para a MESMA versão do CDN declarada no <script>
    locateFile: file =>
      `https://cdn.jsdelivr.net/npm/@mediapipe/face_mesh@${CONFIG.MP_VERSION}/${file}`,
  });

  faceMesh.setOptions({
    maxNumFaces:            1,
    refineLandmarks:        true,   // precisão extra na região dos olhos/lábios
    minDetectionConfidence: 0.70,
    minTrackingConfidence:  0.70,
  });

  faceMesh.onResults(onRostoDetectado);

  // ── Loop com requestAnimationFrame ───────────────────────────
  let emEnvio = false;

  async function loop() {
    // Só envia se o vídeo tem dados suficientes e nenhum send está pendente
    if (!emEnvio && videoEl.readyState >= HTMLMediaElement.HAVE_ENOUGH_DATA) {
      emEnvio = true;
      try {
        await faceMesh.send({ image: videoEl });
      } catch (e) {
        // Erros isolados de send não interrompem o loop
        console.warn('[faceMesh] send error:', e);
      } finally {
        emEnvio = false;
      }
    }
    requestAnimationFrame(loop);
  }

  requestAnimationFrame(loop);
}

// ═══════════════════════════════════════════════════════════════
// 10. Ponto de entrada
// ═══════════════════════════════════════════════════════════════

reloadSessionsEl?.addEventListener('click', carregarSessoes);

(async function main() {
  try {
    const user = await window.Auth.requireAuth(['admin', 'gestor', 'instrutor', 'colaborador']);
    if (!user) return;

    // Carrega configurações de captura do backend (sem auth)
    try {
      const cfgRes = await fetch(`${CONFIG.API_BASE_URL}/config/publica`);
      if (cfgRes.ok) {
        const cfgJson = await cfgRes.json();
        aplicarConfigPublica(cfgJson?.data);
      }
    } catch (_) {
      // Falha silenciosa — usa defaults do CONFIG
    }

    await carregarSessoes();
    await iniciarCamera();
    registrarEventosDeOrientacaoCamera();
    setStatus('Iniciando detecção...', 'info');
    await detectarRosto();

  } catch (err) {
    console.error('[main] Falha ao iniciar:', err);

    if (err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError') {
      setStatus('Permissão de câmera negada', 'erro');
    } else if (err.name === 'NotFoundError' || err.name === 'DevicesNotFoundError') {
      setStatus('Câmera não encontrada', 'erro');
    } else if (err.name === 'NotReadableError') {
      setStatus('Câmera em uso por outro app', 'erro');
    } else {
      setStatus('Erro ao iniciar. Verifique a câmera.', 'erro');
    }
  }
})();
