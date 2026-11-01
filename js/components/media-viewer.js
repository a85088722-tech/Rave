import { icon } from './icons.js';
import { esc, longDate, hhmm, fmtDuration } from '../core/utils.js';

function mediaHTML(item) {
  const url = item.url || (item.media && item.media.url);
  const kind = item.kind || (item.media && item.media.kind);
  if (url && kind === 'video') return `<video class="viewer-el" src="${esc(url)}" controls playsinline autoplay></video>`;
  if (url) return `<img class="viewer-el" src="${esc(url)}" alt="">`;
  return `<div class="ph tone-${item.tone || 0}" style="width:100%;height:100%">${kind === 'video' ? icon('play', 48) : icon('image', 40)}${kind === 'video' && item.dur ? `<span class="badge-dur">${fmtDuration(item.dur)}</span>` : ''}</div>`;
}

const btnStyle = 'background:rgba(255,255,255,.1);border:0;color:#fff';

/** Visionneuse plein écran d'un souvenir (photo ou vidéo) avec favori et suppression. */
export function openViewer(item, { onFav, onDelete } = {}) {
  const el = document.createElement('div');
  el.className = 'viewer';
  const render = () => {
    el.innerHTML = `
      <div class="viewer-top">
        <button class="icon-btn round" data-act="close" aria-label="Fermer" style="${btnStyle}">${icon('x', 20)}</button>
        <div class="grow"></div>
        <button class="icon-btn round" data-act="fav" aria-label="${item.fav ? 'Retirer des favoris' : 'Ajouter aux favoris'}" style="${btnStyle};color:${item.fav ? 'var(--pink-soft)' : '#fff'}">${icon(item.fav ? 'heart' : 'heart-line', 20)}</button>
        ${onDelete ? `<button class="icon-btn round" data-act="delete" aria-label="Supprimer" style="${btnStyle}">${icon('trash', 19)}</button>` : ''}
      </div>
      <div class="viewer-media">${mediaHTML(item)}</div>
      <div class="viewer-info">
        <span class="title-sm">${esc(item.caption || (item.kind === 'video' ? 'Vidéo' : 'Photo'))}</span>
        <span class="muted small">${longDate(item.at)} · ${hhmm(item.at)}${item.byName ? ' · ajouté par ' + esc(item.byName) : ''}</span>
      </div>`;
  };
  render();
  document.body.appendChild(el);
  const close = () => el.remove();
  el.addEventListener('click', e => {
    const b = e.target.closest('[data-act]');
    if (!b) return;
    if (b.dataset.act === 'close') close();
    if (b.dataset.act === 'fav') { if (onFav) onFav(item); render(); }
    if (b.dataset.act === 'delete') {
      if (b.dataset.confirm) { close(); if (onDelete) onDelete(item); return; }
      b.dataset.confirm = '1'; b.style.background = 'rgba(244,63,94,.45)';
      b.setAttribute('aria-label', 'Toucher encore pour supprimer');
      setTimeout(() => { if (b.isConnected) { delete b.dataset.confirm; b.style.background = 'rgba(255,255,255,.1)'; } }, 2500);
    }
  });
  return close;
}

/** Aperçu simple d'une photo ou vidéo reçue dans le chat. */
export function openMediaPreview(media) {
  const el = document.createElement('div');
  el.className = 'viewer';
  el.innerHTML = `
    <div class="viewer-top"><button class="icon-btn round" data-act="close" aria-label="Fermer" style="${btnStyle}">${icon('x', 20)}</button></div>
    <div class="viewer-media">${mediaHTML({ media })}</div>
    <div class="viewer-info"></div>`;
  document.body.appendChild(el);
  el.addEventListener('click', e => { if (e.target.closest('[data-act="close"]')) el.remove(); });
}
