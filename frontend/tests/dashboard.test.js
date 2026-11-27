'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

function setup() {
  const elements = new Map();
  const element = () => ({ textContent: '', children: [], dataset: {}, className: '',
    append(...items) { this.children.push(...items); },
    replaceChildren(...items) { this.children = items; },
    setAttribute() {}, addEventListener() {},
  });
  const context = vm.createContext({
    document: { hidden: false, getElementById(id) { if (!elements.has(id)) elements.set(id, element()); return elements.get(id); }, createElement: element, addEventListener() {} },
    window: { Auth: { requireAuth: async () => null } },
    Intl, Date, URLSearchParams, setInterval() {}, console,
  });
  vm.runInContext(fs.readFileSync(require.resolve('../scripts/dashboard.js'), 'utf8'), context);
  return { elements, run: (code) => vm.runInContext(code, context) };
}

test('classifica e ordena sessões e contabiliza todas, inclusive além de 20', () => {
  const s = setup();
  s.run(`renderizarSessoes([
    {id: 3, fim_efetivo_em: '2026-11-27T15:00:00Z'},
    {id: 2}, {id: 1, inicio_efetivo_em: '2026-11-27T14:00:00Z'},
    ...Array.from({length: 22}, (_, i) => ({id: i + 4}))
  ])`);
  assert.equal(s.elements.get('kpiTotal').textContent, '25');
  assert.equal(s.elements.get('kpiPendentes').textContent, '23');
  assert.equal(s.elements.get('kpiAndamento').textContent, '1');
  assert.equal(s.elements.get('kpiConcluidas').textContent, '1');
  assert.equal(s.elements.get('dashboardLista').children[0].dataset.status, 'em_andamento');
  assert.equal(s.elements.get('dashboardLista').children.at(-1).dataset.status, 'concluida');
});

test('lista vazia e campos sem horário têm mensagens claras; nomes são texto', () => {
  const s = setup();
  s.run('renderizarSessoes([])');
  assert.equal(s.elements.get('dashboardLista').children[0].textContent, 'Nenhuma sessão prevista para hoje');
  s.run(`renderizarSessoes([{id: 7, tipo_sessao: '<img src=x>', instrutor_nome: 'Ana'}])`);
  const card = s.elements.get('dashboardLista').children[0];
  assert.equal(card.children[0].children[1].textContent, '<img src=x>');
  assert.match(card.children[0].children[2].textContent, /Aguardando início/);
  assert.equal(card.children[1].children[1].href, 'sessao.html?id=7');
});

test('falha de atualização preserva dados e indica que estão desatualizados', async () => {
  const s = setup();
  s.run(`window.Auth.apiJson = async () => ({data: [{id: 1}]})`);
  await s.run('carregarDados()');
  s.run(`window.Auth.apiJson = async () => { throw new Error('offline'); }`);
  await s.run('carregarDados()');
  assert.equal(s.elements.get('kpiTotal').textContent, '1');
  assert.match(s.elements.get('dashboardStatus').textContent, /desatualizados/);
  assert.equal(s.elements.get('dashboardAtualizar').disabled, false);
});

test('consulta usa o novo dia e não mantém sessões de ontem se a rede falhar', async () => {
  const s = setup();
  s.run(`obterDataHojeLocal = () => '2026-11-27'; window.Auth.apiJson = async () => ({data: [{id: 1}]})`);
  await s.run('carregarDados()');
  s.run(`obterDataHojeLocal = () => '2026-11-28'; window.Auth.apiJson = async (url) => { window.ultimaUrl = url; throw new Error('offline'); }`);
  await s.run('carregarDados()');
  assert.equal(s.run('window.ultimaUrl'), '/sessoes?data=2026-11-28');
  assert.equal(s.elements.get('kpiTotal').textContent, '—');
  assert.equal(s.elements.get('dashboardLista').children[0].textContent, 'Sessões indisponíveis no momento.');
});

test('atualizações simultâneas compartilham uma única consulta em andamento', async () => {
  const s = setup();
  s.run(`window.chamadas = 0; window.Auth.apiJson = () => { window.chamadas++; return new Promise(resolve => { window.resolver = resolve; }); }`);
  const pending = s.run('carregarDados()');
  await s.run('carregarDados()');
  assert.equal(s.run('window.chamadas'), 1);
  s.run('window.resolver({data: []})');
  await pending;
  assert.equal(s.elements.get('dashboardAtualizar').disabled, false);
});
