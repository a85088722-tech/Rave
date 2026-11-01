import { state } from '../../core/state.js';
import { on } from '../../core/events.js';
import { icon } from '../../components/icons.js';
import { avatar } from '../../components/avatar.js';
import { openSheet, openActions } from '../../components/modal.js';
import { toast } from '../../components/toast.js';
import { esc, fmtDuration, parseYouTube, relativeLabel } from '../../core/utils.js';
import { CONFIG } from '../../config.js';
import { P, play, toggle, seekBy, setSlot, position, onEnded } from './player.js';
import { addToQueue, removeFromQueue, markPlaying, recordDirectPlay, fetchVideoInfo, searchYouTube, updateTitle } from '../../services/youtube.service.js';
import { addTrack, removeTrack } from '../../services/music.service.js';
import { update } from '../../core/state.js';

const byLabel = k => (k === 'me' ? 'toi' : state.partner.name);
const thumbHTML = (it, cls) => it.thumb && !CONFIG.DEMO
  ? `<div class="ph ${cls}"><img class="thumb-img" src="${esc(it.thumb)}" alt="" loading="lazy">${it.dur ? `<span class="badge-dur">${fmtDuration(it.dur)}</span>` : ''}</div>`
  : `<div class="ph ${cls} tone-${it.tone || 0}">${it.dur ? `<span class="badge-dur">${fmtDuration(it.dur)}</span>` : icon(cls.includes('cover') ? 'music' : 'play', 18)}</div>`;

/* ---------------- Enchaînements ---------------- */
async function playQueueItem(q) {
  await play(q, { src: 'video' });
  if (q.rowId) markPlaying(q.rowId).catch(() => {});
  if (CONFIG.DEMO) update('together', s => { s.together.history.unshift(Object.assign({ at: Date.now() }, s.together.current || q)); s.together.queue = s.together.queue.filter(x => x.rowId !== q.rowId); s.together.current = q; });
}
async function playNextVideo() {
  const q = state.together.queue[0];
  if (!q) { toast('La file d’attente est vide'); return; }
  await playQueueItem(q);
}
async function playTrack(i) {
  const t = state.music.tracks[i];
  if (!t) return;
  update('music', s => { s.music.current = i; });
  await play(Object.assign({ dur: t.dur || 0 }, t), { src: 'music' });
}
onEnded(p => {
  if (p.src === 'music') { const n = state.music.tracks.length; if (n) playTrack((state.music.current + 1) % n); }
  else if (state.together.queue.length) playNextVideo();
});
on('player:title', item => { if (item && item.id) updateTitle(item.id, item.title).catch(() => {}); });

/* ---------------- Ajout : lien ou recherche ---------------- */
async function addInput(value, target) {
  const id = parseYouTube(value);
  if (id) {
    const info = CONFIG.DEMO ? { title: target === 'music' ? 'Morceau YouTube' : 'Vidéo YouTube', channel: id, thumb: '' } : await fetchVideoInfo(id);
    if (target === 'music') { await addTrack({ id, title: info.title, artist: info.channel, thumb: info.thumb }); toast('Ajouté à la playlist'); }
    else { await addToQueue({ id, title: info.title, channel: info.channel, thumb: info.thumb }); toast('Ajoutée à la file d’attente'); }
    return true;
  }
  if (!value.trim()) return false;
  if (CONFIG.DEMO) { toast('Dans l’aperçu, colle un lien YouTube. La recherche marche dans la vraie app avec une clé API.', 4000); return false; }
  const results = await searchYouTube(value.trim());
  openSheet({
    title: 'Résultats',
    body: results.length ? `<div class="col" style="gap:6px">${results.map((r, i) => `<button class="result-item" data-r="${i}"><img src="${esc(r.thumb)}" alt="" loading="lazy"><div class="col grow"><span style="font-size:13px;font-weight:700;line-height:1.3">${esc(r.title)}</span><span class="muted" style="font-size:11px">${esc(r.channel)}</span></div>${icon('plus', 18)}</button>`).join('')}</div>` : '<div class="empty-state">Aucun résultat.</div>',
    onMount(sheet, close) {
      sheet.querySelectorAll('[data-r]').forEach(b => b.addEventListener('click', async () => {
        const r = results[+b.dataset.r];
        b.disabled = true;
        try {
          if (target === 'music') { await addTrack({ id: r.id, title: r.title, artist: r.channel, thumb: r.thumb }); toast('Ajouté à la playlist'); }
          else { await addToQueue(r); toast('Ajoutée à la file d’attente'); }
          b.innerHTML = b.innerHTML.replace(/<svg[\s\S]*<\/svg>$/, icon('check', 18));
        } catch (e) { b.disabled = false; toast(e.message); }
      }));
    }
  });
  return true;
}

export function renderTogether(view) {
  let tab = 'videos';
  try { tab = sessionStorage.getItem('duo2.tab') || 'videos'; sessionStorage.removeItem('duo2.tab'); } catch (e) { /* rien */ }
  if (P.item && P.src === 'music' && tab === 'videos') tab = 'music';

  const nowCard = (src) => {
    const active = P.item && P.src === src;
    const it = active ? P.item : null;
    const { pos, dur } = position();
    const pct = active && dur ? Math.min(100, pos / dur * 100) : 0;
    return `
      <div class="card" style="overflow:hidden">
        <div class="yt-slot" id="ytSlot">
          ${!active ? `<div class="empty-yt">${icon(src === 'music' ? 'music' : 'together', 30)}<span>${src === 'music' ? 'Choisis un morceau dans la playlist' : 'Choisis une vidéo dans la file ou ajoute un lien'}</span></div>` : ''}
          ${active && CONFIG.DEMO ? `<div class="empty-yt">${icon(src === 'music' ? 'music' : 'play', 40)}<span>Ici le lecteur YouTube (vraie app)</span></div>` : ''}
          ${src === 'video' ? `<span class="sync-badge" style="z-index:16"><span class="status-dot${state.partner.online === true ? '' : ' off'}"></span>${state.partner.online === true ? 'Synchronisé avec ' + esc(state.partner.name) : CONFIG.DEMO ? 'Aperçu' : esc(state.partner.name) + ' hors ligne'}</span>` : ''}
        </div>
        ${P.needsTap && active ? '<div class="tap-banner">Touche la vidéo une fois pour te synchroniser</div>' : ''}
        <div class="col" style="padding:14px 16px 16px;gap:10px">
          <div class="col" style="${src === 'music' ? 'align-items:center;text-align:center' : ''}"><span class="title-sm" id="nowTitle">${it ? esc(it.title) : src === 'music' ? 'Aucun morceau en cours' : 'Rien en cours'}</span><span class="muted small">${it ? esc(it.channel || it.artist || '') + (it.by ? ' · ajouté par ' + esc(byLabel(it.by)) : '') : ''}</span></div>
          <div class="progress"><i id="prog" style="width:${pct}%"></i></div>
          <div class="row muted" style="justify-content:space-between;font-size:11px"><span id="pos">${fmtDuration(active ? pos : 0)}</span><span id="dur">${fmtDuration(active ? dur : 0)}</span></div>
          <div class="controls">
            <button class="icon-btn round" data-act="${src === 'music' ? 'mprev' : 'back'}" aria-label="${src === 'music' ? 'Morceau précédent' : 'Reculer de 10 secondes'}" style="border:0;background:var(--surface-2)">${icon(src === 'music' ? 'prev' : 'rewind', 20)}</button>
            <button class="big-play" data-act="toggle" aria-label="Lecture ou pause pour vous deux">${icon(active && P.playing ? 'pause' : 'play', 22)}</button>
            <button class="icon-btn round" data-act="${src === 'music' ? 'mnext' : 'next'}" aria-label="Suivant" style="border:0;background:var(--surface-2)">${icon('next', 20)}</button>
          </div>
        </div>
      </div>`;
  };

  const videosHTML = () => {
    const t = state.together;
    return `
      ${nowCard('video')}
      <form class="search" id="addForm">${icon('search', 18)}<input id="addInput" placeholder="${CONFIG.YOUTUBE_API_KEY ? 'Rechercher ou coller un lien YouTube' : 'Coller un lien YouTube'}" autocomplete="off" enterkeyhint="search" aria-label="Rechercher ou coller un lien YouTube"><button class="icon-btn round grad" type="submit" aria-label="Ajouter" style="width:38px;height:38px">${icon('plus', 18)}</button></form>
      <div class="section-head"><h2>File d’attente · ${t.queue.length}</h2><button data-act="history" class="row" style="gap:5px">${icon('history', 14)}Historique</button></div>
      <div class="col" style="gap:10px">
        ${t.queue.length ? t.queue.map(v => `
          <button class="queue-item" data-q="${esc(v.rowId)}">
            ${thumbHTML(v, '')}
            <div class="col grow"><span style="font-size:13px;font-weight:700" class="ellipsis">${esc(v.title)}</span><span class="muted" style="font-size:11px">Ajoutée par ${esc(byLabel(v.by))}</span></div>
            <span class="icon-btn plain" aria-hidden="true">${icon('more', 18)}</span>
          </button>`).join('') : '<div class="empty-state">La file est vide. Ajoute une vidéo.</div>'}
      </div>`;
  };

  const musicHTML = () => {
    const m = state.music;
    return `
      ${nowCard('music')}
      <form class="search" id="addForm">${icon('search', 18)}<input id="addInput" placeholder="${CONFIG.YOUTUBE_API_KEY ? 'Rechercher un titre ou coller un lien' : 'Coller un lien YouTube (clip, son)'}" autocomplete="off" enterkeyhint="go" aria-label="Ajouter un morceau"><button class="icon-btn round grad" type="submit" aria-label="Ajouter à la playlist" style="width:38px;height:38px">${icon('plus', 18)}</button></form>
      <div class="section-head"><h2>Playlist partagée · ${m.tracks.length}</h2></div>
      <div class="col" style="gap:8px">
        ${m.tracks.length ? m.tracks.map((t, i) => {
          const cur = P.item && P.src === 'music' && (P.item.rowId ? P.item.rowId === t.rowId : P.item.id === t.id);
          return `
          <div class="queue-item" style="${cur ? 'background:var(--grad-soft);border:1px solid rgba(196,181,253,.25)' : ''}">
            <button data-play="${i}" class="row grow" style="gap:12px;text-align:left" aria-label="Lire ${esc(t.title)}">
              ${thumbHTML(t, 'cover')}
              <div class="col grow"><span style="font-size:14px;font-weight:700" class="ellipsis">${esc(t.title)}</span><span class="muted" style="font-size:12px">${esc(t.artist)}${cur && P.playing ? ' · en cours' : ''}</span></div>
            </button>
            <button class="icon-btn plain" data-del="${esc(t.rowId)}" aria-label="Retirer de la playlist">${icon('x', 18)}</button>
          </div>`; }).join('') : '<div class="empty-state">Ajoutez vos morceaux préférés.</div>'}
      </div>`;
  };

  let renderedKey = '';
  const render = () => {
    renderedKey = (P.item ? P.item.id + P.src : '') + (P.needsTap ? 't' : '');
    view.innerHTML = `
      <div class="page">
        <div class="page-head"><h1 class="page-title">Ensemble</h1></div>
        <div class="segmented" role="tablist">
          <button role="tab" aria-selected="${tab === 'videos'}" class="${tab === 'videos' ? 'on' : ''}" data-tab="videos">${icon('together', 16)}Vidéos</button>
          <button role="tab" aria-selected="${tab === 'music'}" class="${tab === 'music' ? 'on' : ''}" data-tab="music">${icon('music', 16)}Musique</button>
        </div>
        ${tab === 'videos' ? videosHTML() : musicHTML()}
      </div>`;
    setSlot(view.querySelector('#ytSlot'));
    view.querySelector('#addForm').addEventListener('submit', async e => {
      e.preventDefault();
      const inp = view.querySelector('#addInput');
      const v = inp.value;
      try { if (await addInput(v, tab === 'music' ? 'music' : 'videos')) inp.value = ''; } catch (err) { toast(err.message, 4000); }
    });
  };

  const tick = () => {
    const { pos, dur } = position();
    const prog = view.querySelector('#prog'), p = view.querySelector('#pos'), d = view.querySelector('#dur');
    if (!P.item) return;
    if (prog && dur) prog.style.width = Math.min(100, pos / dur * 100) + '%';
    if (p) p.textContent = fmtDuration(pos);
    if (d && dur) d.textContent = fmtDuration(dur);
  };

  const onClick = async e => {
    const tb = e.target.closest('[data-tab]');
    if (tb) { tab = tb.dataset.tab; render(); return; }
    const q = e.target.closest('[data-q]');
    if (q) {
      const item = state.together.queue.find(x => String(x.rowId) === q.dataset.q);
      if (!item) return;
      openActions('Dans la file', [
        { icon: 'play', label: 'Lire maintenant pour vous deux', run: () => playQueueItem(item) },
        { icon: 'trash', label: 'Retirer de la file', danger: true, run: () => removeFromQueue(item.rowId) }
      ]);
      return;
    }
    const pl = e.target.closest('[data-play]');
    if (pl) {
      const i = +pl.dataset.play, t = state.music.tracks[i];
      if (P.item && P.src === 'music' && t && (P.item.rowId ? P.item.rowId === t.rowId : P.item.id === t.id)) toggle(); else playTrack(i);
      return;
    }
    const del = e.target.closest('[data-del]');
    if (del) { removeTrack(del.dataset.del).catch(err => toast(err.message)); return; }
    const b = e.target.closest('[data-act]');
    if (!b) return;
    const a = b.dataset.act;
    if (a === 'toggle') {
      const src = tab === 'music' ? 'music' : 'video';
      if (P.item && P.src === src) toggle();
      else if (src === 'music') { if (state.music.tracks.length) playTrack(Math.max(0, state.music.current)); else toast('La playlist est vide'); }
      else if (state.together.current) { await play(state.together.current, { src: 'video' }); }
      else playNextVideo();
    }
    if (a === 'back') seekBy(-10);
    if (a === 'next') playNextVideo();
    if (a === 'mnext' && state.music.tracks.length) playTrack((state.music.current + 1) % state.music.tracks.length);
    if (a === 'mprev' && state.music.tracks.length) playTrack((state.music.current - 1 + state.music.tracks.length) % state.music.tracks.length);
    if (a === 'history') {
      const h = state.together.history;
      openSheet({
        title: 'Historique',
        body: h.length ? `<div class="col" style="gap:10px">${h.map((v, i) => `<button class="queue-item" data-h="${i}">${thumbHTML(v, '')}<div class="col grow"><span style="font-size:13px;font-weight:700" class="ellipsis">${esc(v.title)}</span><span class="muted" style="font-size:11px">${relativeLabel(v.at || Date.now())} · ajoutée par ${esc(byLabel(v.by))}</span></div>${icon('play', 16)}</button>`).join('')}</div>` : '<div class="empty-state">Rien regardé pour l’instant.</div>',
        onMount(sheet, close) {
          sheet.querySelectorAll('[data-h]').forEach(btn => btn.addEventListener('click', async () => {
            const v = h[+btn.dataset.h]; close();
            await play(v, { src: 'video' });
            recordDirectPlay(v).catch(() => {});
          }));
        }
      });
    }
  };

  render();
  view.addEventListener('click', onClick);
  const timer = setInterval(tick, 1000);
  const offs = [
    on('change:together', render), on('change:music', render), on('change:all', render),
    on('change:presence', render),
    on('player', () => {
      const btn = view.querySelector('[data-act="toggle"]');
      const t = view.querySelector('#nowTitle');
      if (btn) btn.innerHTML = icon(P.item && P.playing ? 'pause' : 'play', 22);
      if (t && P.item) t.textContent = P.item.title;
      const key = (P.item ? P.item.id + P.src : '') + (P.needsTap ? 't' : '');
      if (key !== renderedKey) render();
    })
  ];
  return () => { clearInterval(timer); setSlot(null); view.removeEventListener('click', onClick); offs.forEach(f => f()); };
}
