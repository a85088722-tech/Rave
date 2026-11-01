import { state, person } from '../../core/state.js';
import { on } from '../../core/events.js';
import { icon } from '../../components/icons.js';
import { avatar } from '../../components/avatar.js';
import { soon } from '../../components/toast.js';
import { startCall } from '../video/call.js';
import { esc, longDate, daysUntil, parseDay, relativeLabel, fmtDuration } from '../../core/utils.js';
import { openProfile } from '../profile/profile.js';
import { CONFIG } from '../../config.js';
import { EVENT_TYPES } from '../calendar/calendar.js';

export function nextEvent() {
  return state.events
    .filter(e => daysUntil(e.end || e.date) >= 0)
    .sort((a, b) => parseDay(a.date) - parseDay(b.date))[0] || null;
}

function lastMessagePreview(m) {
  if (m.deleted) return 'Message supprimé';
  if (m.type === 'video') return `${icon('video', 14)} Vidéo`;
  if (m.type === 'photo') return `${icon('image', 14)} Photo`;
  if (m.type === 'voice') return `${icon('mic', 14)} Message vocal · ${fmtDuration(m.duration)}`;
  return esc(m.text);
}

export function renderHome(view) {
  const render = () => {
    const me = state.me, p = state.partner;
    const ev = nextEvent();
    const lastIn = state.messages.filter(m => m.from !== 'me').slice(-1);
    const lastOut = state.messages.filter(m => m.from === 'me').slice(-1);
    const msgs = lastIn.concat(lastOut).sort((a, b) => b.at - a.at);
    const mems = state.memories.slice().sort((a, b) => b.at - a.at).slice(0, 3);
    const unread = state.messages.filter(m => m.from !== 'me' && !m.read).length;

    view.innerHTML = `
    <div class="page">
      <div class="page-head">
        <div class="row" style="gap:10px"><span class="wordmark">Duo</span>${CONFIG.DEMO ? '<span class="demo-pill">Aperçu</span>' : ''}</div>
        <div class="row" style="gap:8px">
          <button class="icon-btn" data-act="notif" aria-label="Notifications">${icon('bell', 20)}${unread ? '<span class="dot"></span>' : ''}</button>
          <button data-act="profile" aria-label="Mon profil" style="border-radius:50%">${avatar(me, 40, { ring: 'violet' })}</button>
        </div>
      </div>

      <div class="hello col">
        <span class="muted" style="font-size:13px">${longDate(new Date())}</span>
        <h1>Bonjour ${esc(me.name)}</h1>
      </div>

      <div class="card pad couple">
        <div class="row" style="gap:14px">
          <div class="pair">${avatar(me, 52, { ring: 'violet' })}${avatar(p, 52, { ring: 'pink' })}</div>
          <div class="col grow" style="gap:3px">
            <span style="font-size:17px;font-weight:700">${p.missing ? 'Ton espace Duo' : 'Toi &amp; ' + esc(p.name)}</span>
            ${p.missing
              ? `<button class="row" data-act="invite" style="gap:6px;font-size:13px;color:var(--pink-soft);font-weight:600">${icon('plus', 14)}Inviter ton duo</button>`
              : p.online === undefined
                ? `<span class="muted ellipsis" style="font-size:13px">${p.status ? esc(p.status) : 'Espace Duo actif'}</span>`
                : `<span class="row muted" style="gap:6px;font-size:13px"><span class="status-dot${p.online ? '' : ' off'}"></span>${esc(p.name)} ${p.online ? 'est en ligne' : 'est hors ligne'}</span>`}
          </div>
        </div>
        <div class="row" style="gap:10px">
          <button class="btn glass" style="flex:1" data-act="audio">${icon('phone', 17)}Appel audio</button>
          <button class="btn primary" style="flex:1" data-act="video">${icon('video', 17)}Appel vidéo</button>
        </div>
      </div>

      ${ev ? `
      <a href="#dates" class="card-grad"><div class="inner row" style="gap:14px">
        <div class="tile-ic ${EVENT_TYPES[ev.type].cls}">${icon(EVENT_TYPES[ev.type].icon, 20)}</div>
        <div class="col grow">
          <span class="kicker">Prochaine date</span>
          <span class="title-sm ellipsis" style="color:var(--text)">${esc(ev.title)}</span>
          <span class="muted small">${longDate(parseDay(ev.date))}${ev.time ? ' · ' + esc(ev.time) : ''}</span>
        </div>
        <div class="col" style="align-items:center">
          <span class="countdown-n" style="color:var(--text)">${Math.max(0, daysUntil(ev.date))}</span>
          <span class="muted" style="font-size:11px">${daysUntil(ev.date) === 1 ? 'jour' : 'jours'}</span>
        </div>
      </div></a>` : `
      <button class="card pad row" data-act="add-date" style="text-align:left;width:100%"><div class="tile-ic ic-violet">${icon('calendar', 20)}</div><div class="col grow"><span class="title-sm">Aucune date à venir</span><span class="muted small">Ajoute votre prochain rendez-vous</span></div>${icon('plus', 18)}</button>`}

      <div class="section-head"><h2>Derniers messages</h2><a href="#chat">Voir tout</a></div>
      <div class="card" style="overflow:hidden">
        ${msgs.length ? '' : '<a href="#chat" class="msg-row" style="color:var(--muted)">Aucun message pour l\u2019instant</a>'}
        ${msgs.map(m => `
          <a href="#chat" class="msg-row" style="color:var(--text)">
            ${avatar(person(m.from), 42)}
            <div class="col grow">
              <span style="font-size:14px;font-weight:700">${m.from === 'me' ? 'Toi' : esc(p.name)}</span>
              <span class="row ellipsis" style="gap:6px;font-size:13px;color:${m.from !== 'me' && !m.read ? 'var(--text-2)' : 'var(--muted)'}">${lastMessagePreview(m)}</span>
            </div>
            <span class="muted" style="font-size:11px">${relativeLabel(m.at)}</span>
          </a>`).join('')}
      </div>

      <div class="section-head"><h2>Souvenirs récents</h2><a href="#souvenirs">Voir tout</a></div>
      <div class="grid-3">
        ${mems.length ? mems.map(m => `<a href="#souvenirs" class="ph tone-${m.tone}" style="height:108px" aria-label="${m.kind === 'video' ? 'Vidéo' : 'Photo'}">${m.url && m.kind === 'photo' ? `<img class="thumb-img" src="${esc(m.url)}" alt="" loading="lazy">` : icon(m.kind === 'video' ? 'play' : 'image', 22)}</a>`).join('') : '<a href="#souvenirs" class="tile" style="grid-column:1 / -1;height:72px">Ajoutez votre premier souvenir</a>'}
      </div>

      <div class="section-head"><h2>Faire quelque chose ensemble</h2></div>
      <div class="grid-3">
        <a href="#ensemble" class="tile" data-tab="videos"><span style="color:var(--violet-soft);display:flex">${icon('together', 22)}</span>Vidéos</a>
        <a href="#ensemble" class="tile" data-tab="music"><span style="color:var(--pink-soft);display:flex">${icon('music', 22)}</span>Musique</a>
        <a href="#dates" class="tile"><span style="color:var(--violet-soft);display:flex">${icon('calendar', 22)}</span>Calendrier</a>
      </div>
    </div>`;
  };

  const onClick = e => {
    const tab = e.target.closest('[data-tab]');
    if (tab) sessionStorageSafe('duo2.tab', tab.dataset.tab);
    const b = e.target.closest('[data-act]');
    if (!b) return;
    const act = b.dataset.act;
    if (act === 'audio') startCall('audio');
    if (act === 'video') startCall('video');
    if (act === 'notif') openProfile();
    if (act === 'profile' || act === 'invite') openProfile();
    if (act === 'add-date') location.hash = 'dates';
  };

  render();
  view.addEventListener('click', onClick);
  const offs = ['change:messages', 'change:events', 'change:memories', 'change:profile', 'change:presence', 'change:all'].map(n => on(n, render));
  return () => { view.removeEventListener('click', onClick); offs.forEach(f => f()); };
}

function sessionStorageSafe(k, v) { try { sessionStorage.setItem(k, v); } catch (e) { /* rien */ } }
