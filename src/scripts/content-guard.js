const guardedMediaSelector = '[data-content-guard], img, picture, canvas';
const guardedTextSelector = '[data-content-guard="text"]';
const editableSelector = 'input, textarea, select, [contenteditable]:not([contenteditable="false"])';

export const setupContentGuard = () => {
  if (window.__varelismContentGuardReady) return;
  window.__varelismContentGuardReady = true;

  // Delegation also covers content inserted by Astro page transitions.
  const guardMediaInteraction = (event) => {
    const target = event.target;
    if (!(target instanceof Element) || target.closest(editableSelector)) return;
    const guardedTarget = target.closest(guardedMediaSelector);
    const draggedMediaLink = event.type === 'dragstart'
      && target.closest('a')?.querySelector(guardedMediaSelector);
    if (guardedTarget || draggedMediaLink) event.preventDefault();
  };

  document.addEventListener('contextmenu', guardMediaInteraction);
  document.addEventListener('dragstart', guardMediaInteraction);
  document.addEventListener('copy', (event) => {
    const target = event.target;
    if (target instanceof Element && target.closest(editableSelector)) return;
    const selection = window.getSelection();
    if (!selection || selection.isCollapsed) {
      if (target instanceof Element && target.closest(guardedTextSelector)) event.preventDefault();
      return;
    }
    for (const body of document.querySelectorAll(guardedTextSelector)) {
      for (let index = 0; index < selection.rangeCount; index += 1) {
        if (selection.getRangeAt(index).intersectsNode(body)) {
          event.preventDefault();
          return;
        }
      }
    }
  });
};
