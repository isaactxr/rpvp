'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

function setup() {
  const document = { activeElement: null };
  const control = () => ({ isConnected: true, focus() { document.activeElement = this; }, getClientRects: () => [1] });
  const origin = control();
  const first = control();
  const last = control();
  const listeners = {};
  const modal = { querySelectorAll: () => [first, last], addEventListener: (key, fn) => { listeners[key] = fn; } };
  const window = {};
  vm.runInNewContext(fs.readFileSync(require.resolve('../components/modal-focus.js'), 'utf8'), { window, document });
  let closed = false;
  const focus = window.ModalFocus.create(modal, () => { closed = true; focus.close(); });
  document.activeElement = origin;
  focus.open();
  const key = (key, shiftKey = false) => {
    let prevented = false;
    listeners.keydown({ key, shiftKey, preventDefault() { prevented = true; } });
    return prevented;
  };
  return { document, origin, first, last, focus, key, closed: () => closed };
}

test('Tab e Shift+Tab mantêm o foco no modal', () => {
  const s = setup();
  assert.equal(s.document.activeElement, s.first);
  s.document.activeElement = s.last;
  assert.equal(s.key('Tab'), true);
  assert.equal(s.document.activeElement, s.first);
  assert.equal(s.key('Tab', true), true);
  assert.equal(s.document.activeElement, s.last);
});

test('Esc fecha e devolve o foco à origem', () => {
  const s = setup();
  assert.equal(s.key('Escape'), true);
  assert.equal(s.closed(), true);
  assert.equal(s.document.activeElement, s.origin);
});

test('fechar modal sem origem conectada não move o foco', () => {
  const s = setup();
  s.origin.isConnected = false;
  s.focus.close();
  assert.equal(s.document.activeElement, s.first);
});

test('fechar usa controle substituto quando a tabela recria a origem', () => {
  const s = setup();
  s.origin.isConnected = false;
  s.focus.close(s.last);
  assert.equal(s.document.activeElement, s.last);
});
