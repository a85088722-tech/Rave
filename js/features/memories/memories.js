import { state } from '../../core/state.js';
import { addMemories, toggleFavorite, deleteMemory } from '../../services/memories.service.js';
import { on } from '../../core/events.js';
import { icon } from '../../components/icons.js';
import { openViewer } from '../../components/media-viewer.js';
import { soon, toast } from '../../components/toast.js';
import { esc, MONTHS, cap, fmtDuration, longDate } from '../../core/utils.js';

const FILTERS = [
  { key: 'all', label: 'Tout' },
  { key: 'photo', label: 'Photos' },
  { key: 'video', label: 'Vidéos' },
  { key: 'fav', label: 'Favoris' }
];

function onThisDay() {
  const t = new Date();
  return state.memories.filter(m => {
    const d = new Date(m.at);
    return d.getDate() === t.getDate() && d.getMonth() === t.getMonth() && d.getFullYear() < t.getFullYear();
  }).sort((a, b) => b.at - a.at);
}

export function renderMemories(view) {
  let filter = 'all';
  let query = '';

  const visible = () => state.memories
    .filter(m => filter === 'all' || (filter === 'fav' ? m.fav : m.kind === filter))
    .filter(m => !query || (m.caption || '').toLowerCase().includes(query) || longDate(m.at).toLowerCase().includes(query) || MONTHS[new Date(m.at).getMonth()].includes(query))
    .sort((a, b) => b.at - a.at);

  const gridHTML = () => {
    const items = visible();
    if (!items.length) return `<div class="empty-state">${icon('image', 28)}<span>${query || filter !== 'all' ? 'Aucun souvenir ne correspond.' : 'Aucun souvenir pour l’instant.'}</span></div>`;
    const groups = [];
    items.forEach(m => {
      const d = new Date(m.at), label = cap(MONTHS[d.getMonth()]) + ' ' + d.getFullYear();
      let g = groups.find(x => x.label === label);
      if (!g) { g = { label, items: [] }; groups.push(g); }
      g.items.push(m);
    });
    return groups.map(g => `
      <div class="section-head" style="margin-bottom:-8px"><h2>${g.label}</h2><span class="muted small">${g.items.length} élément${g.items.length > 1 ? 's' : ''}</span></div>
      <div class="mem-grid">${g.items.map(m => `
        <button class="ph tone-${m.tone}" data-mem="${m.id}" aria-label="${m.kind === 'video' ? 'Vidéo' : 'Photo'} du ${longDate(m.at)}">
          ${m.url && m.kind === 'photo' ? `<img class="thumb-img" src="${esc(m.url)}" alt="" loading="lazy">` : m.kind === 'video' ? icon('play', 20) : icon('image', 20)}
          ${m.fav ? `<span class="badge-fav">${icon('heart', 11)}</span>` : ''}
          ${m.kind === 'video' ? `<span class="badge-dur" style="left:6px;right:auto">${icon('play', 9)}${fmtDuration(m.dur)}</span>` : ''}
        </button>`).join('')}</div>`).join('');
  };

  const render = () => {
    const otd = onThisDay();
    const years = otd.length ? new Date().getFullYear() - new Date(otd[0].at).getFullYear() : 0;
    view.innerHTML = `
      <div class="page">
        <div class="page-head"><h1 class="page-title">Souvenirs</h1><button class="icon-btn grad" data-act="add" aria-label="Ajouter des photos ou vidéos">${icon('plus', 20, { stroke: 2.2 })}</button></div>
        <label class="search">${icon('search', 17)}<input id="memSearch" placeholder="Rechercher par mois, date, légende" value="${esc(query)}" autocomplete="off" enterkeyhint="search" aria-label="Rechercher un souvenir"></label>
        ${otd.length ? `
        <button class="onthisday tone-${otd[0].tone}" data-mem="${otd[0].id}">
          ${otd[0].url && otd[0].kind === 'photo' ? `<img class="thumb-img" src="${esc(otd[0].url)}" alt="">` : `<span style="position:absolute;top:40%;left:50%;transform:translate(-50%,-50%);color:rgba(245,243,255,.35);display:flex">${icon('image', 30)}</span>`}
          <div class="shade"><div class="col"><span class="kicker pink">Ce jour-là</span><span style="font-size:16px;font-weight:800">Il y a ${years} an${years > 1 ? 's' : ''}</span><span style="font-size:12px;color:var(--text-2)">${longDate(otd[0].at)} ${new Date(otd[0].at).getFullYear()} · ${otd.length} souvenir${otd.length > 1 ? 's' : ''}</span></div><span class="chip" style="background:rgba(255,255,255,.16);border:0;color:#fff">Revoir</span></div>
        </button>` : ''}
        <div class="chips" role="tablist">${FILTERS.map(f => `<button role="tab" aria-selected="${f.key === filter}" class="chip${f.key === filter ? ' on' : ''}" data-filter="${f.key}">${f.key === 'fav' ? icon('heart', 13) : ''}${f.label}</button>`).join('')}</div>
        <div id="memGrid" class="col" style="gap:16px">${gridHTML()}</div>
      </div>`;
    const inp = view.querySelector('#memSearch');
    inp.addEventListener('input', () => { query = inp.value.trim().toLowerCase(); view.querySelector('#memGrid').innerHTML = gridHTML(); });
  };

  const onClick = e => {
    const f = e.target.closest('[data-filter]');
    if (f) { filter = f.dataset.filter; render(); return; }
    const m = e.target.closest('[data-mem]');
    if (m) {
      const item = state.memories.find(x => x.id === m.dataset.mem);
      if (item) openViewer(Object.assign({ byName: item.by === 'me' ? 'toi' : state.partner.name }, item), {
        onFav: it => { it.fav = !it.fav; toggleFavorite(it.id).catch(err => toast(err.message)); },
        onDelete: it => { deleteMemory(it.id).then(() => toast('Souvenir supprimé')).catch(err => toast(err.message)); }
      });
      return;
    }
    const b = e.target.closest('[data-act]');
    if (b && b.dataset.act === 'add') {
      const inp = document.createElement('input');
      inp.type = 'file'; inp.accept = 'image/*,video/*'; inp.multiple = true; inp.style.display = 'none';
      inp.addEventListener('change', () => { const files = inp.files; inp.remove(); if (files && files.length) addMemories(files).catch(err => toast(err.message, 4500)); });
      document.body.appendChild(inp); inp.click();
    }
  };

  render();
  view.addEventListener('click', onClick);
  const offs = ['change:memories', 'change:all'].map(n => on(n, () => {
    const focused = document.activeElement && document.activeElement.id === 'memSearch';
    if (focused) view.querySelector('#memGrid').innerHTML = gridHTML(); else render();
  }));
  return () => { view.removeEventListener('click', onClick); offs.forEach(f => f()); };
}
