/**
 * Lecteur YouTube partagé et synchronisé entre les deux téléphones.
 * - Un seul lecteur pour toute l'app (vidéos ET musique), dans un cadre fixe qui ne
 *   quitte jamais la page : il se place sur l'emplacement de l'onglet Ensemble, ou
 *   devient une mini-fenêtre ailleurs, sans recharger la vidéo.
 * - Synchro par le canal privé : yt:load / yt:play / yt:pause / yt:tick / yt:hello / yt:state.
 * - Règles reprises de Duo 1 : correction au-delà de 2 s, appui requis sur iPhone,
 *   pas de pause envoyée quand iOS met l'app en arrière-plan.
 * Aperçu (DEMO) : lecture simulée, sans YouTube.
 */
import { CONFIG } from '../../config.js';
import { state } from '../../core/state.js';
import { emit, on } from '../../core/events.js';
import { broadcast, onBroadcast } from '../../services/realtime.js';
import { icon } from '../../components/icons.js';
import { esc } from '../../core/utils.js';
import { toast } from '../../components/toast.js';

export const P = {
  item: null,       // { id, title, channel, thumb, rowId? }
  src: 'video',     // 'video' | 'music'
  playing: false,
  pos: 0,
  dur: 0,
  needsTap: false
};

let yt = null, ytReady = null, host = null, slot = null, miniClosed = false;
let suppressUntil = 0, pending = null, controller = false, tickTimer = null, demoTimer = null, hiddenAt = 0;
let onEndedCb = null;

const changed = () => emit('player', P);
export function onEnded(fn) { onEndedCb = fn; }

/* ---------------- Cadre du lecteur ---------------- */
function ensureHost() {
  if (host) return host;
  host = document.createElement('div');
  host.id = 'ytHost';
  host.className = 'yt-host hidden';
  host.innerHTML = `<div id="ytFrame"></div><div class="yt-mini-bar"><span class="yt-grip" aria-hidden="true">${icon('grip', 16)}</span><button data-yt="open" class="grow ellipsis" aria-label="Ouvrir Ensemble"></button><button data-yt="toggle" aria-label="Lecture ou pause"></button><button data-yt="size" aria-label="Agrandir ou réduire"></button><button data-yt="close" aria-label="Fermer la mini-fenêtre">${icon('x', 16)}</button></div>`;
  document.body.appendChild(host);
  host.addEventListener('click', e => {
    if (Date.now() - dragEndAt < 350) return; // fin d'un déplacement, pas un appui
    const b = e.target.closest('[data-yt]'); if (!b) return;
    if (b.dataset.yt === 'open') location.hash = 'ensemble';
    if (b.dataset.yt === 'toggle') toggle();
    if (b.dataset.yt === 'size') { mini.big = !mini.big; saveMini(); place(); }
    if (b.dataset.yt === 'close') { miniClosed = true; if (P.playing) pause(); place(); }
  });
  initDrag(host.querySelector('.yt-mini-bar'));
  window.addEventListener('resize', place);
  const view = document.getElementById('view');
  view.addEventListener('scroll', () => requestAnimationFrame(place), { passive: true });
  return host;
}

/* ---- Mini-fenêtre déplaçable (on la tient par sa barre du bas) ---- */
const MINI_KEY = 'duo2.mini';
let mini = (() => { try { return JSON.parse(localStorage.getItem(MINI_KEY)) || {}; } catch { return {}; } })();
let dragMoved = false, dragEndAt = 0;
function saveMini() { try { localStorage.setItem(MINI_KEY, JSON.stringify(mini)); } catch {} }

let safeTopPx = null;
function safeTop() {
  if (safeTopPx == null) {
    const d = document.createElement('div');
    d.style.cssText = 'position:fixed;top:0;height:0;padding-top:env(safe-area-inset-top,0px);visibility:hidden';
    document.body.appendChild(d); safeTopPx = d.offsetHeight || 0; d.remove();
  }
  return safeTopPx;
}
function miniSize() {
  const vw = window.innerWidth;
  const w = mini.big ? vw - 16 : Math.min(Math.round(vw * 0.72), 420);
  return { w, h: Math.round(w * 9 / 16) + 44 };
}
function miniBounds(h) {
  const header = document.querySelector('#view .chat-head, #view .page-head');
  const topMin = 8 + safeTop();
  const nav = document.getElementById('navbar');
  let navTop = nav && nav.offsetParent !== null ? nav.getBoundingClientRect().top : window.innerHeight;
  const composer = document.querySelector('#view .composer'); // dans le Chat : ne jamais cacher la zone d'écriture
  if (composer) navTop = Math.min(navTop, composer.getBoundingClientRect().top - 4);
  const hb = header ? header.getBoundingClientRect().bottom : 0;
  return { top: topMin, bottom: navTop - h - 8, headerBottom: hb > 40 ? hb : safeTop() + 84 };
}
function clampMini(x, y, w, h) {
  const b = miniBounds(h);
  return {
    x: Math.min(Math.max(8, x), window.innerWidth - w - 8),
    y: Math.min(Math.max(b.top, y), Math.max(b.top, b.bottom))
  };
}

function initDrag(handle) {
  let sx = 0, sy = 0, ox = 0, oy = 0, pid = null;
  const move = e => {
    if (e.pointerId !== pid) return;
    const dx = e.clientX - sx, dy = e.clientY - sy;
    if (!dragMoved && Math.hypot(dx, dy) < 8) return;
    dragMoved = true;
    host.classList.add('dragging');
    const { w, h } = miniSize();
    const p = clampMini(ox + dx, oy + dy, w, h);
    host.style.left = p.x + 'px'; host.style.top = p.y + 'px';
    e.preventDefault();
  };
  const end = e => {
    if (e.pointerId !== pid) return;
    pid = null;
    window.removeEventListener('pointermove', move);
    window.removeEventListener('pointerup', end);
    window.removeEventListener('pointercancel', end);
    host.classList.remove('dragging');
    if (dragMoved) {
      dragEndAt = Date.now(); dragMoved = false;
      const r = host.getBoundingClientRect();
      mini.x = r.left / window.innerWidth; mini.y = r.top / window.innerHeight; // en proportion de l'écran
      saveMini();
    }
  };
  handle.addEventListener('pointerdown', e => {
    if (!host.classList.contains('mini') || pid !== null) return;
    pid = e.pointerId; dragMoved = false;
    sx = e.clientX; sy = e.clientY;
    const r = host.getBoundingClientRect(); ox = r.left; oy = r.top;
    window.addEventListener('pointermove', move, { passive: false });
    window.addEventListener('pointerup', end);
    window.addEventListener('pointercancel', end);
  });
}

/** L'onglet Ensemble fournit un emplacement (élément 16:9). null = ailleurs dans l'app. */
export function setSlot(el) { slot = el; if (el) miniClosed = false; place(); }

function place() {
  if (!host) return;
  const show = !!P.item && (!!slot || !miniClosed);
  host.classList.toggle('hidden', !show);
  if (!show) return;
  if (slot && slot.isConnected) {
    const r = slot.getBoundingClientRect();
    host.classList.remove('mini');
    Object.assign(host.style, { left: r.left + 'px', top: r.top + 'px', width: r.width + 'px', height: r.height + 'px' });
    const navTop = document.getElementById('navbar').getBoundingClientRect().top;
    host.style.clipPath = r.bottom > navTop ? `inset(0 0 ${r.bottom - navTop}px 0)` : '';
    host.style.visibility = r.bottom < 0 || r.top > navTop ? 'hidden' : 'visible';
  } else {
    host.classList.add('mini');
    host.style.clipPath = ''; host.style.visibility = 'visible';
    const { w, h } = miniSize();
    // Par défaut : en haut à droite, sous l'en-tête (ne cache jamais la zone d'écriture)
    const b = miniBounds(h);
    const x = mini.x != null ? mini.x * window.innerWidth : window.innerWidth - w - 8;
    const y = mini.y != null ? mini.y * window.innerHeight : b.headerBottom + 8;
    const p = clampMini(x, y, w, h);
    Object.assign(host.style, { left: p.x + 'px', top: p.y + 'px', width: w + 'px', height: h + 'px' });
    const bar = host.querySelector('.yt-mini-bar');
    bar.querySelector('[data-yt="open"]').innerHTML = `${esc(P.item ? P.item.title : '')}`;
    bar.querySelector('[data-yt="toggle"]').innerHTML = icon(P.playing ? 'pause' : 'play', 16);
    bar.querySelector('[data-yt="size"]').innerHTML = icon(mini.big ? 'shrink' : 'expand', 16);
  }
}

/* ---------------- Chargement du lecteur YouTube ---------------- */
function loadApi() {
  if (ytReady) return ytReady;
  ytReady = new Promise(res => {
    if (window.YT && window.YT.Player) return res();
    window.onYouTubeIframeAPIReady = () => res();
    const s = document.createElement('script');
    s.src = 'https://www.youtube.com/iframe_api';
    document.head.appendChild(s);
  });
  return ytReady;
}

async function ensurePlayer(videoId, start, autoplay) {
  ensureHost();
  if (CONFIG.DEMO) return;
  await loadApi();
  if (!yt) {
    await new Promise(res => {
      yt = new YT.Player('ytFrame', {
        videoId, width: '100%', height: '100%',
        playerVars: { playsinline: 1, rel: 0, modestbranding: 1, autoplay: autoplay ? 1 : 0, start: Math.floor(start || 0) },
        events: { onReady: () => res(), onStateChange: onYtState }
      });
    });
    return;
  }
  if (autoplay) yt.loadVideoById({ videoId, startSeconds: start || 0 });
  else yt.cueVideoById({ videoId, startSeconds: start || 0 });
}

const ok = () => !!(yt && yt.getPlayerState);
const curTime = () => (CONFIG.DEMO ? P.pos : ok() ? yt.getCurrentTime() : 0);
const wasJustHidden = () => document.hidden || Date.now() - hiddenAt < 1500;

function onYtState(e) {
  const st = e.data;
  if (st === 1 || st === 5) {
    try { const d = yt.getVideoData(); if (d && d.title && P.item && (!P.item.title || P.item.title === 'Vidéo YouTube' || P.item.title === 'Morceau')) { P.item.title = d.title; emit('player:title', P.item); } } catch (err) { /* rien */ }
    P.dur = yt.getDuration() || P.dur;
  }
  if (st === 1) { P.needsTap = false; }
  if (st === 1 && pending) {
    const target = pending.time + (pending.playing ? (Date.now() - pending.at) / 1000 : 0), wasPlaying = pending.playing;
    pending = null; suppressUntil = Date.now() + 1500;
    yt.seekTo(target, true); if (!wasPlaying) yt.pauseVideo();
  }
  P.playing = st === 1 || st === 3;
  changed(); place();
  if (st === 0) { P.playing = false; changed(); if (controller && onEndedCb) onEndedCb(P); return; }
  if (Date.now() < suppressUntil) return;
  if (st === 1) { controller = true; send('yt:play', { time: curTime() }); }
  else if (st === 2) {
    if (wasJustHidden()) return;
    setTimeout(() => { if (ok() && !wasJustHidden() && yt.getPlayerState() === 2) { controller = true; send('yt:pause', { time: curTime() }); } }, 400);
  }
}

function send(event, payload) { broadcast(event, Object.assign({ src: P.src, id: P.item && P.item.id }, payload)); }

function needsTapCheck(time, playing) {
  if (!playing || CONFIG.DEMO) return;
  const at = Date.now();
  setTimeout(() => {
    if (!ok()) return;
    const st = yt.getPlayerState();
    if (st !== 1 && st !== 3) { pending = { time, at, playing: true }; P.needsTap = true; changed(); }
  }, 1800);
}

/* ---------------- Simulation (aperçu) ---------------- */
function demoRun() {
  clearInterval(demoTimer);
  demoTimer = setInterval(() => {
    if (!P.playing) return;
    P.pos += 1;
    if (P.dur && P.pos >= P.dur) { P.playing = false; P.pos = P.dur; if (onEndedCb) onEndedCb(P); }
    changed();
  }, 1000);
}

/* ---------------- Commandes (locales → partagées) ---------------- */
export async function play(item, { src = 'video', time = 0, autoplay = true, silent = false } = {}) {
  P.item = Object.assign({}, item); P.src = src; P.pos = time; P.dur = item.dur || 0; P.needsTap = false;
  miniClosed = false;
  if (!silent) { controller = true; send('yt:load', { item: P.item, time, playing: autoplay }); }
  suppressUntil = Date.now() + 2500;
  if (CONFIG.DEMO) { ensureHost(); P.playing = autoplay; if (!P.dur) P.dur = src === 'music' ? 210 : 1500; demoRun(); changed(); place(); return; }
  await ensurePlayer(item.id, time, autoplay);
  suppressUntil = Date.now() + 1500;
  changed(); place();
  if (silent) needsTapCheck(time, autoplay);
}

export function toggle() {
  if (!P.item) return;
  if (CONFIG.DEMO) { P.playing = !P.playing; changed(); place(); return; }
  if (!ok()) return;
  const st = yt.getPlayerState();
  if (st === 1 || st === 3) yt.pauseVideo(); else yt.playVideo();
}

export function pause() {
  if (CONFIG.DEMO) { P.playing = false; changed(); return; }
  if (ok()) yt.pauseVideo();
}

export function seekBy(delta) {
  if (!P.item) return;
  const t = Math.max(0, curTime() + delta);
  if (CONFIG.DEMO) { P.pos = t; changed(); return; }
  if (!ok()) return;
  suppressUntil = Date.now() + 1200;
  yt.seekTo(t, true);
  controller = true;
  send(yt.getPlayerState() === 1 ? 'yt:play' : 'yt:pause', { time: t });
}

export function position() { return { pos: curTime(), dur: CONFIG.DEMO ? P.dur : (ok() ? yt.getDuration() || P.dur : P.dur) }; }

/* ---------------- Ordres reçus de l'autre téléphone ---------------- */
function sameItem(m) { return P.item && m.id === P.item.id; }

onBroadcast('yt:load', m => {
  controller = false;
  toast(`${state.partner.name} a lancé ${m.src === 'music' ? 'un morceau' : 'une vidéo'}`);
  play(m.item, { src: m.src, time: m.time || 0, autoplay: m.playing !== false, silent: true });
});

onBroadcast('yt:play', m => {
  if (!sameItem(m)) return;
  controller = false;
  if (CONFIG.DEMO) { P.pos = m.time; P.playing = true; changed(); return; }
  if (!ok()) return;
  suppressUntil = Date.now() + 1500;
  const t = m.time + (Date.now() - m.at) / 1000;
  if (Math.abs(yt.getCurrentTime() - t) > 1) yt.seekTo(t, true);
  yt.playVideo();
  needsTapCheck(t, true);
});

onBroadcast('yt:pause', m => {
  if (!sameItem(m)) return;
  controller = false;
  if (CONFIG.DEMO) { P.pos = m.time; P.playing = false; changed(); return; }
  if (!ok()) return;
  suppressUntil = Date.now() + 1500;
  if (pending) pending = Object.assign({}, pending, { time: m.time, playing: false });
  yt.pauseVideo();
  if (Math.abs(yt.getCurrentTime() - m.time) > 0.5) yt.seekTo(m.time, true);
});

onBroadcast('yt:tick', m => {
  if (!sameItem(m) || CONFIG.DEMO || !ok() || pending) return;
  const st = yt.getPlayerState(), localPlaying = st === 1 || st === 3;
  const t = m.time + (Date.now() - m.at) / 1000;
  if (m.playing && !localPlaying && st !== -1 && st !== 5) { suppressUntil = Date.now() + 1500; yt.seekTo(t, true); yt.playVideo(); needsTapCheck(t, true); }
  else if (!m.playing && localPlaying) { suppressUntil = Date.now() + 1500; yt.pauseVideo(); }
  else if (m.playing && Math.abs(yt.getCurrentTime() - t) > 2) { suppressUntil = Date.now() + 1500; yt.seekTo(t, true); }
});

// L'autre vient d'arriver : on lui envoie où on en est
onBroadcast('yt:hello', () => {
  if (!P.item) return;
  broadcast('yt:state', { src: P.src, item: P.item, time: curTime(), playing: P.playing });
});
onBroadcast('yt:state', m => {
  if (!m.item) return;
  if (sameItem(m)) { emitTick(m); return; }
  play(m.item, { src: m.src, time: m.time + (Date.now() - m.at) / 1000, autoplay: m.playing, silent: true });
});
function emitTick(m) { const set = { id: m.item.id, time: m.time, playing: m.playing, at: m.at }; onTick(set); }
function onTick(m) { /* même logique que yt:tick */ if (!ok() || pending) return; const t = m.time + (Date.now() - m.at) / 1000; if (Math.abs(yt.getCurrentTime() - t) > 2) { suppressUntil = Date.now() + 1500; yt.seekTo(t, true); } }

on('realtime:ready', () => broadcast('yt:hello'));
on('realtime:resume', () => broadcast('yt:hello'));

// Celui qui a la main envoie sa position toutes les 4 s
tickTimer = setInterval(() => {
  if (!controller || !P.item || CONFIG.DEMO || document.hidden || !ok()) return;
  broadcast('yt:tick', { src: P.src, id: P.item.id, time: curTime(), playing: P.playing });
}, 4000);

document.addEventListener('visibilitychange', () => { if (document.hidden) hiddenAt = Date.now(); });
