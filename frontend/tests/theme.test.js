'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

function setup(saved, blocked = false) {
  const events = {};
  const storageEvents = {};
  const values = new Map(saved === undefined ? [] : [['laboral_theme_v1', saved]]);
  const buttons = [];
  const logos = [];
  const root = { dataset: {} };
  const document = {
    documentElement: root,
    addEventListener: (name, fn) => { events[name] = fn; },
    querySelectorAll: (selector) => selector === '[data-theme-toggle]' ? buttons : logos,
  };
  const localStorage = {
    getItem: (key) => { if (blocked) throw new Error('storage blocked'); return values.get(key) ?? null; },
    setItem: (key, value) => { if (blocked) throw new Error('storage blocked'); values.set(key, value); },
  };
  vm.runInNewContext(fs.readFileSync(require.resolve('../scripts/theme.js'), 'utf8'), {
    document, localStorage, window: { addEventListener: (name, fn) => { storageEvents[name] = fn; } },
  });
  const attributes = {};
  const label = { textContent: '' };
  const button = { setAttribute: (key, value) => { attributes[key] = value; }, querySelector: () => label };
  buttons.push(button);
  const logo = { setAttribute: (key, value) => { logo[key] = value; } };
  logos.push(logo);
  events.DOMContentLoaded();
  const toggle = () => events.click({ target: { closest: () => button } });
  return { root, values, attributes, label, logo, toggle, storageEvents };
}

test('tema escuro é aplicado antes de montar a interface e sincroniza o botão', () => {
  const s = setup();
  assert.equal(s.root.dataset.theme, 'dark');
  assert.equal(s.attributes['aria-pressed'], 'true');
  assert.equal(s.label.textContent, 'Escuro');
  assert.equal(s.logo.src, '../assets/img/logo.png');
});

test('troca para claro, salva preferência e atualiza marca e acessibilidade', () => {
  const s = setup();
  s.toggle();
  assert.equal(s.root.dataset.theme, 'light');
  assert.equal(s.values.get('laboral_theme_v1'), 'light');
  assert.equal(s.attributes['aria-pressed'], 'false');
  assert.equal(s.label.textContent, 'Claro');
  assert.equal(s.attributes['aria-label'], 'Tema claro');
  assert.equal(s.logo.src, '../assets/img/logo_dark.png');
});

test('recupera preferência clara em outra página e permite voltar ao escuro', () => {
  const s = setup('light');
  assert.equal(s.root.dataset.theme, 'light');
  s.toggle();
  assert.equal(s.root.dataset.theme, 'dark');
  assert.equal(s.values.get('laboral_theme_v1'), 'dark');
});

test('storage indisponível não impede renderização nem troca de tema', () => {
  const s = setup(undefined, true);
  assert.equal(s.root.dataset.theme, 'dark');
  s.toggle();
  assert.equal(s.root.dataset.theme, 'light');
});

test('valor inválido salvo usa o padrão escuro', () => {
  assert.equal(setup('invalid').root.dataset.theme, 'dark');
});

test('sincroniza mudança e remoção da preferência em outra aba', () => {
  const s = setup();
  s.storageEvents.storage({ key: 'laboral_theme_v1', newValue: 'light' });
  assert.equal(s.root.dataset.theme, 'light');
  s.storageEvents.storage({ key: 'laboral_theme_v1', newValue: null });
  assert.equal(s.root.dataset.theme, 'dark');
});
