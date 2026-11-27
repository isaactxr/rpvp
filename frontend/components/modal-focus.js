'use strict';

// Compartilhado pelos modais sem alterar seus IDs, submissões ou permissões.
window.ModalFocus = {
  create(container, onEscape) {
    let origin = null;
    const controls = () => [...(container?.querySelectorAll(
      'button:not(:disabled), a[href], input:not(:disabled):not([type="hidden"]), select:not(:disabled), textarea:not(:disabled), [tabindex="0"]'
    ) || [])].filter((element) => element.getClientRects().length > 0);
    container?.addEventListener('keydown', (event) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        onEscape();
        return;
      }
      if (event.key !== 'Tab') return;
      const items = controls();
      const first = items[0];
      const last = items[items.length - 1];
      if (first && event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (last && !event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    });
    return {
      open() {
        origin = document.activeElement;
        controls()[0]?.focus();
      },
      close(fallback) {
        const target = origin?.isConnected ? origin : fallback;
        target?.focus();
        origin = null;
      },
    };
  },
};
