'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');

function setup() {
  const elements = new Map();
  const calls = [];
  const canvasContext = {};
  for (const name of ['clearRect', 'save', 'beginPath', 'moveTo', 'lineTo', 'closePath', 'setLineDash', 'stroke', 'fill', 'arc', 'restore']) {
    canvasContext[name] = (...args) => calls.push({ name, args });
  }
  const document = { getElementById(id) {
    if (!elements.has(id)) elements.set(id, {
      textContent: '', style: {}, disabled: false,
      setAttribute() {}, classList: { add() {}, remove() {}, toggle() {} },
      addEventListener() {}, getContext: () => canvasContext,
      clientWidth: 640, clientHeight: 480, videoWidth: 640, videoHeight: 480,
      width: 640, height: 480,
    });
    return elements.get(id);
  } };
  const context = vm.createContext({ document, window: { Auth: { getApiBase: () => '/api', requireAuth: async () => null } }, console,
    getComputedStyle: (element) => ({ objectFit: element.objectFit || 'contain' }),
  });
  vm.runInContext(fs.readFileSync(require.resolve('../scripts/sessao.js'), 'utf8') + '\nthis.uiTest = { state, setStatus, onRostoDetectado, apresentarErroCamera: typeof apresentarErroCamera === "function" ? apresentarErroCamera : null };', context);
  vm.runInContext('Object.assign(this.uiTest, { CONFIG, detectarPiscada, aplicarConfigPublica, desenharOverlay, toPixel });', context);
  return { ui: context.uiTest, elements, calls };
}

test('ausência de rosto não apaga resultado durante o cooldown', async () => {
  const { ui, elements } = setup();
  ui.setStatus('Presença registrada', 'confirmado');
  ui.state.processando = true;
  await ui.onRostoDetectado({ multiFaceLandmarks: [] });
  assert.equal(elements.get('statusText').textContent, 'Presença registrada');
});

test('erro de permissão explica recuperação em português e preserva dados da sessão', () => {
  const { ui, elements } = setup();
  const subtitle = elements.get('sessaoSubtitulo');
  if (subtitle) subtitle.textContent = 'Sessão ID 1';
  ui.apresentarErroCamera({ name: 'NotAllowedError', message: 'Permission denied' });
  assert.match(elements.get('statusText').textContent, /Permita o acesso/);
  if (subtitle) assert.equal(subtitle.textContent, 'Sessão ID 1');
});

test('piscada com uma amostra fechada exige duas amostras de reabertura', () => {
  const { ui } = setup();
  const results = [0.30, 0.10, 0.30, 0.30].map(ui.detectarPiscada);
  assert.deepEqual(results, [false, false, false, true]);
});

test('olhos abertos ou fechados continuamente não registram piscada', () => {
  const { ui } = setup();
  for (const ear of [0.3, 0.3, 0.3, 0.1, 0.1, 0.1]) assert.equal(ui.detectarPiscada(ear), false);
  assert.equal(ui.detectarPiscada(0.3), false);
  assert.equal(ui.detectarPiscada(0.3), true);
  assert.equal(ui.detectarPiscada(0.3), false);
});

test('continua permitindo exigir dois frames fechados pelas configurações', () => {
  const { ui } = setup();
  ui.aplicarConfigPublica({ frames_fechado_min: 2 });
  for (const ear of [0.1, 0.3, 0.3]) assert.equal(ui.detectarPiscada(ear), false);
  for (const ear of [0.1, 0.1, 0.3]) assert.equal(ui.detectarPiscada(ear), false);
  assert.equal(ui.detectarPiscada(0.3), true);
});

test('máscara ligada desenha dois olhos e desativar limpa sem redesenhar', () => {
  const { ui, calls } = setup();
  const landmarks = Array.from({ length: 468 }, () => ({ x: 0.5, y: 0.5 }));
  ui.desenharOverlay(landmarks, true);
  assert.equal(calls.length, 0, 'desligada por padrão não trabalha no canvas');
  ui.aplicarConfigPublica({ mostrar_mascara_olhos: true });
  ui.desenharOverlay(landmarks, true);
  assert.equal(calls.filter(c => c.name === 'stroke').length, 2);
  assert.equal(calls.filter(c => c.name === 'arc').length, 12);
  ui.aplicarConfigPublica({ mostrar_mascara_olhos: false });
  const clears = calls.filter(c => c.name === 'clearRect').length;
  assert.ok(clears >= 2, 'limpa os últimos pontos ao desligar');
  ui.desenharOverlay(landmarks, true);
  assert.equal(calls.filter(c => c.name === 'clearRect').length, clears);
});

test('perder o rosto limpa pontos antigos', () => {
  const { ui, calls } = setup();
  ui.aplicarConfigPublica({ mostrar_mascara_olhos: true });
  ui.desenharOverlay(Array.from({ length: 468 }, () => ({ x: 0.5, y: 0.5 })), true);
  const before = calls.filter(c => c.name === 'clearRect').length;
  ui.desenharOverlay(null, false);
  assert.equal(calls.filter(c => c.name === 'clearRect').length, before + 1);
});

test('pontos respeitam letterbox, recorte e espelhamento do vídeo', () => {
  const { ui, elements } = setup();
  const video = elements.get('video');
  const canvas = elements.get('canvasOverlay');
  video.videoWidth = 1280; video.videoHeight = 720;
  canvas.width = 640; canvas.height = 640;
  ui.state.cameraFacingMode = 'environment';
  let point = ui.toPixel({ x: 0.25, y: 0.25 });
  assert.equal(point.x, 160); assert.equal(point.y, 230);
  ui.state.cameraFacingMode = 'user';
  point = ui.toPixel({ x: 0.25, y: 0.25 });
  assert.equal(point.x, 480); assert.equal(point.y, 230);
  video.objectFit = 'cover';
  ui.state.cameraFacingMode = 'environment';
  point = ui.toPixel({ x: 0.25, y: 0.25 });
  assert.ok(Math.abs(point.x - 35.5555556) < 0.001);
  assert.equal(point.y, 160);
});
