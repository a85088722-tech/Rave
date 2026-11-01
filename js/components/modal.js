import { esc } from '../core/utils.js';
import { icon } from './icons.js';

/**
 * Ouvre une feuille en bas de l'écran.
 * body : HTML du contenu ; onMount(sheetEl, close) pour brancher les boutons.
 * Retourne la fonction close().
 */
export function openSheet({ title = '', body = '', onMount, onClose } = {}) {
  const root = document.getElementById('sheet-root');
  const overlay = document.createElement('div');
  overlay.className = 'overlay';
  overlay.innerHTML = `
    <div class="sheet" role="dialog" aria-modal="true" aria-label="${esc(title)}">
      <div class="handle"></div>
      ${title ? `<div class="sheet-head"><h3>${esc(title)}</h3><button class="icon-btn round" data-close aria-label="Fermer">${icon('x', 18)}</button></div>` : ''}
      <div class="sheet-body" style="display:flex;flex-direction:column;gap:16px">${body}</div>
    </div>`;
  root.appendChild(overlay);

  let closed = false;
  const close = () => {
    if (closed) return;
    closed = true;
    overlay.remove();
    if (onClose) onClose();
  };
  overlay.addEventListener('click', e => {
    if (e.target === overlay || e.target.closest('[data-close]')) close();
  });
  if (onMount) onMount(overlay.querySelector('.sheet'), close);
  return close;
}

/** Liste d'actions simple : [{ icon, label, danger, run }] */
export function openActions(title, actions, extraTop = '') {
  return openSheet({
    title,
    body: `${extraTop}<div class="action-list">${actions.map((a, i) =>
      `<button data-i="${i}" class="${a.danger ? 'danger' : ''}">${icon(a.icon, 19)}${esc(a.label)}</button>`).join('')}</div>`,
    onMount(sheet, close) {
      sheet.querySelectorAll('.action-list button').forEach(b => {
        b.addEventListener('click', () => { close(); actions[+b.dataset.i].run(); });
      });
    }
  });
}
