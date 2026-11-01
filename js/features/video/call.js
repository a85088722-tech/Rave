/**
 * Écran d'appel (audio/vidéo) + sonnerie entre les deux téléphones.
 * Signalisation par le canal privé : call:ring / call:accept / call:decline / call:cancel / call:end
 */
import { state } from '../../core/state.js';
import { CONFIG } from '../../config.js';
import { icon } from '../../components/icons.js';
import { avatar } from '../../components/avatar.js';
import { toast } from '../../components/toast.js';
import { esc, uid } from '../../core/utils.js';
import { broadcast, onBroadcast } from '../../services/realtime.js';
import { joinCall } from '../../services/calls.service.js';
import { pause as pauseVideo } from '../together/player.js';

let ui = null;          // élément de l'écran d'appel
let call = null;        // connexion LiveKit
let current = null;     // { id, kind, role: 'caller'|'callee', state }
let ringTimer = null, ringAudio = null, clock = null;

function canCall() {
  if (CONFIG.DEMO) { toast('Les appels fonctionnent dans la vraie app, pas dans l’aperçu'); return false; }
  if (state.partner.missing) { toast('Invite d’abord ton duo'); return false; }
  if (current) { toast('Un appel est déjà en cours'); return false; }
  return true;
}

/* ---------------- Sonnerie ---------------- */
function ring(start) {
  if (!start) { if (ringAudio) { clearInterval(ringAudio.t); try { ringAudio.ctx.close(); } catch (e) { /* rien */ } ringAudio = null; } return; }
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    const beep = () => {
      const o = ctx.createOscillator(), g = ctx.createGain();
      o.frequency.value = 660; g.gain.value = 0.08;
      o.connect(g); g.connect(ctx.destination); o.start(); o.stop(ctx.currentTime + 0.35);
    };
    beep();
    ringAudio = { ctx, t: setInterval(beep, 1600) };
  } catch (e) { /* pas de son possible */ }
  if (navigator.vibrate) navigator.vibrate([300, 200, 300]);
}

/* ---------------- Interface ---------------- */
function render() {
  if (!current) { if (ui) { ui.remove(); ui = null; } return; }
  if (!ui) { ui = document.createElement('div'); ui.className = 'call'; document.body.appendChild(ui); ui.addEventListener('click', onClick); }
  const p = state.partner, video = current.kind === 'video';
  const st = current.state;
  const label = st === 'ringing-out' ? 'Appel en cours…' : st === 'ringing-in' ? (video ? 'Appel vidéo entrant' : 'Appel audio entrant') : st === 'connecting' ? 'Connexion…' : (current.note || current.elapsed || '');
  ui.innerHTML = `
    <div class="call-remote" id="callRemote"></div>
    <div class="call-top">
      <div class="col" style="align-items:center;gap:10px;${st === 'live' && video && current.hasRemoteVideo ? 'display:none' : ''}">
        ${avatar(p, 112, { ring: 'pink' })}
        <span style="font-size:24px;font-weight:800">${esc(p.name)}</span>
      </div>
      <span class="call-status" id="callStatus">${esc(label)}</span>
    </div>
    ${video && st === 'live' ? '<div class="call-local" id="callLocal"></div>' : ''}
    <div class="call-controls">
      ${st === 'ringing-in' ? `
        <button class="call-btn decline" data-c="decline" aria-label="Refuser">${icon('x', 26)}</button>
        <button class="call-btn accept" data-c="accept" aria-label="Accepter">${icon(video ? 'video' : 'phone', 26)}</button>` : `
        ${st === 'live' ? `<button class="call-btn${current.mic === false ? ' off' : ''}" data-c="mic" aria-label="${current.mic === false ? 'Activer le micro' : 'Couper le micro'}">${icon('mic', 24)}</button>` : ''}
        ${st === 'live' && video ? `<button class="call-btn${current.cam === false ? ' off' : ''}" data-c="cam" aria-label="Caméra">${icon('video', 24)}</button><button class="call-btn" data-c="flip" aria-label="Changer de caméra">${icon('refresh', 22)}</button>` : ''}
        <button class="call-btn decline" data-c="hangup" aria-label="Raccrocher">${icon('phone', 24)}</button>`}
    </div>`;
  attachLocal();
  reattachRemote();
}

const remoteEls = [];
function reattachRemote() {
  const box = ui && ui.querySelector('#callRemote');
  if (!box) return;
  remoteEls.forEach(el => box.appendChild(el));
}
function attachLocal() {
  const box = ui && ui.querySelector('#callLocal');
  if (!box || !call) return;
  const t = call.localVideoTrack();
  if (t) { const el = t.attach(); el.muted = true; el.setAttribute('playsinline', ''); box.innerHTML = ''; box.appendChild(el); }
}

function setStatus(text) {
  if (!current) return;
  current.note = text;
  const el = ui && ui.querySelector('#callStatus');
  if (el) el.textContent = text || current.elapsed || '';
}

function end(reason) {
  ring(false);
  clearTimeout(ringTimer); clearInterval(clock);
  if (call) { try { call.leave(); } catch (e) { /* rien */ } call = null; }
  remoteEls.splice(0).forEach(el => el.remove());
  current = null;
  render();
  if (reason) toast(reason, 3000);
}

async function goLive() {
  const callId = current.id;
  const stillThis = () => current && current.id === callId;
  current.state = 'connecting'; render();
  pauseVideo();
  try {
    const joined = await joinCall({
      video: current.kind === 'video',
      handlers: {
        onRemoteTrack: (track, kind) => {
          if (!stillThis()) return;
          const el = track.attach();
          el.setAttribute('playsinline', '');
          if (kind === 'video') { el.className = 'call-remote-video'; current.hasRemoteVideo = true; }
          remoteEls.push(el);
          render();
        },
        onRemoteGone: () => { if (stillThis()) end('Appel terminé'); },
        onState: setStatus,
        onEnded: () => { if (stillThis() && current.state === 'live') end('Appel terminé'); }
      }
    });
    // Raccroché (ou appel annulé par l'autre) pendant la connexion : on quitte la salle,
    // sinon le micro restait ouvert sans aucun écran d'appel.
    if (!stillThis()) { try { joined.leave(); } catch (e) { /* rien */ } return; }
    call = joined;
    current.state = 'live'; current.mic = true; current.cam = current.kind === 'video';
    const t0 = Date.now();
    clock = setInterval(() => {
      const s = Math.floor((Date.now() - t0) / 1000);
      current.elapsed = Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0');
      if (!current.note) { const el = ui && ui.querySelector('#callStatus'); if (el) el.textContent = current.elapsed; }
    }, 1000);
    render();
  } catch (e) {
    // L'identifiant est gardé à part : current peut déjà être vide ici, et l'autre
    // téléphone ne recevait alors jamais la fin d'appel.
    broadcast('call:end', { id: callId });
    if (stillThis()) end(e.message);
  }
}

async function onClick(e) {
  const b = e.target.closest('[data-c]');
  if (!b || !current) return;
  const c = b.dataset.c;
  if (c === 'accept') { ring(false); broadcast('call:accept', { id: current.id }); goLive(); }
  if (c === 'decline') { broadcast('call:decline', { id: current.id }); end(); }
  if (c === 'hangup') { broadcast(current.state === 'ringing-out' ? 'call:cancel' : 'call:end', { id: current.id }); end(); }
  if (c === 'mic' && call) { current.mic = current.mic === false; await call.setMic(current.mic); render(); }
  if (c === 'cam' && call) { current.cam = current.cam === false; await call.setCamera(current.cam); render(); }
  if (c === 'flip' && call) { try { await call.switchCamera(); attachLocal(); } catch (err) { toast('Changement de caméra impossible'); } }
}

/* ---------------- Démarrer un appel ---------------- */
export function startCall(kind) {
  if (!canCall()) return;
  if (!CONFIG.LIVEKIT_URL) { toast('Appels pas encore configurés : ajoute LiveKit (voir le guide)', 4500); return; }
  current = { id: uid(), kind, role: 'caller', state: 'ringing-out' };
  render();
  broadcast('call:ring', { id: current.id, kind });
  if (state.partner.online !== true) setStatus(`${state.partner.name} n’a pas l’app ouverte`);
  ringTimer = setTimeout(() => { if (current && current.state === 'ringing-out') { broadcast('call:cancel', { id: current.id }); end('Pas de réponse'); } }, 45000);
}

/* ---------------- Ordres reçus ---------------- */
onBroadcast('call:ring', m => {
  if (current) { broadcast('call:decline', { id: m.id, busy: true }); return; }
  current = { id: m.id, kind: m.kind === 'video' ? 'video' : 'audio', role: 'callee', state: 'ringing-in' };
  render(); ring(true);
  ringTimer = setTimeout(() => { if (current && current.state === 'ringing-in') end('Appel manqué'); }, 45000);
});
onBroadcast('call:accept', m => { if (current && current.id === m.id && current.state === 'ringing-out') { clearTimeout(ringTimer); goLive(); } });
onBroadcast('call:decline', m => { if (current && current.id === m.id) end(m.busy ? `${state.partner.name} est déjà en appel` : `${state.partner.name} a refusé l’appel`); });
onBroadcast('call:cancel', m => { if (current && current.id === m.id) end('Appel manqué'); });
onBroadcast('call:end', m => { if (current && current.id === m.id) end('Appel terminé'); });
