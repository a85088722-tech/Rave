import { esc } from '../core/utils.js';

const validPhoto = p => typeof p === 'string' && /^(data:image\/|https:\/\/)/.test(p);

/**
 * Avatar rond : photo si disponible, sinon l'initiale.
 * opts.ring = 'violet' | 'pink' ; opts.presence = true pour le point « en ligne ».
 */
export function avatar(person, size = 40, opts = {}) {
  const p = person || {};
  const cls = 'avatar' + (p.id === 'p' ? ' p' : '');
  const style = `width:${size}px;height:${size}px;font-size:${Math.round(size * 0.38)}px`;
  const presence = opts.presence ? '<span class="presence"></span>' : '';
  const inner = validPhoto(p.photo)
    ? `<img class="${cls}" src="${esc(p.photo)}" alt="" style="${style}">`
    : `<span class="${cls}" style="${style}">${esc((p.name || '?').trim().charAt(0).toUpperCase())}${presence}</span>`;
  if (!opts.ring) return inner;
  return `<span class="avatar-ring ${opts.ring}" style="width:${size + 4}px;height:${size + 4}px">${inner}</span>`;
}
