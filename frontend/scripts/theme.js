'use strict';

// Executado no head: aplica a preferência antes da primeira pintura.
(function bootstrapTheme() {
  const key = 'laboral_theme_v1';
  const normalize = (value) => value === 'light' ? 'light' : 'dark';
  let initial = 'dark';
  try {
    initial = normalize(localStorage.getItem(key));
  } catch (_err) {
    // Storage bloqueado não deve impedir login ou navegação.
  }

  function apply(theme) {
    document.documentElement.dataset.theme = theme;
    document.querySelectorAll('[data-theme-toggle]').forEach((button) => {
      const dark = theme === 'dark';
      button.setAttribute('aria-label', dark ? 'Tema escuro' : 'Tema claro');
      button.setAttribute('aria-pressed', String(dark));
      button.setAttribute('title', dark ? 'Ativar tema claro' : 'Ativar tema escuro');
      const label = button.querySelector('[data-theme-label]');
      if (label) label.textContent = dark ? 'Escuro' : 'Claro';
    });
    document.querySelectorAll('[data-theme-logo]').forEach((logo) => {
      logo.setAttribute('src', theme === 'dark' ? '../assets/img/logo.png' : '../assets/img/logo_dark.png');
    });
  }

  apply(initial);
  document.addEventListener('DOMContentLoaded', () => apply(document.documentElement.dataset.theme));
  document.addEventListener('click', (event) => {
    if (!event.target.closest?.('[data-theme-toggle]')) return;
    const theme = document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark';
    apply(theme);
    try {
      localStorage.setItem(key, theme);
    } catch (_err) {
      // Mantém a troca funcional nesta página mesmo sem persistência.
    }
  });
  window.addEventListener('storage', (event) => {
    if (event.key === key) apply(normalize(event.newValue));
  });
})();
