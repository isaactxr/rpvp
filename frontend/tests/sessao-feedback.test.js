'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');

function setup() {
  const elements = new Map();
  const document = { getElementById(id) {
    if (!elements.has(id)) elements.set(id, {
      textContent: '', style: {}, disabled: false,
      setAttribute() {}, classList: { add() {}, remove() {}, toggle() {} },
      addEventListener() {}, getContext: () => ({}),
    });
    return elements.get(id);
  } };
  const context = vm.createContext({ document, window: { Auth: { getApiBase: () => '/api', requireAuth: async () => null } }, console });
  vm.runInContext(fs.readFileSync(require.resolve('../scripts/sessao.js'), 'utf8') + '\nthis.uiTest = { state, setStatus, onRostoDetectado, apresentarErroCamera: typeof apresentarErroCamera === "function" ? apresentarErroCamera : null };', context);
  return { ui: context.uiTest, elements };
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
