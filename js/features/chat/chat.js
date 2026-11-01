import { state } from '../../core/state.js';
import { on } from '../../core/events.js';
import { icon, REACTIONS } from '../../components/icons.js';
import { avatar } from '../../components/avatar.js';
import { openSheet } from '../../components/modal.js';
import { toast } from '../../components/toast.js';
import { esc, hhmm, dayLabel, startOfDay, fmtDuration } from '../../core/utils.js';
import { sendText, sendMediaFile, sendVoice, toggleReaction, markRead, deleteMessage, notifyTyping, loadOlder } from '../../services/chat.service.js';
import { startRecording, canRecord } from '../voice/recorder.js';
import { startCall } from '../video/call.js';
import { openMediaPreview } from '../../components/media-viewer.js';

const WAVE = [8, 16, 12, 22, 10, 18, 12, 20, 8, 14, 6, 12, 18, 9];
let audioEl = null;

function what(q) {
  if (q.deleted) return 'Message supprimé';
  return q.type === 'photo' ? 'Photo' : q.type === 'video' ? 'Vidéo' : q.type === 'voice' ? 'Message vocal' : q.text;
}

function quoteHTML(m) {
  const q = state.messages.find(x => x.id === m.replyTo);
  if (!q) return '';
  return `<div class="quote"><b>${q.from === 'me' ? 'Toi' : esc(state.partner.name)}</b><span class="ellipsis" style="display:block">${esc(what(q))}</span></div>`;
}

function reactionsHTML(m) {
  const keys = Object.keys(m.reactions || {}).filter(k => (m.reactions[k] || []).length);
  if (!keys.length) return '';
  const total = keys.reduce((n, k) => n + m.reactions[k].length, 0);
  return `<span class="reactions">${keys.map(k => icon((REACTIONS.find(r => r.key === k) || {}).icon || 'heart', 12)).join('')}${total > 1 ? total : ''}</span>`;
}

function bodyHTML(m) {
  const out = m.from === 'me';
  const status = !out ? '' : m.failed ? `<span style="color:#FDA4AF">non envoyé</span>` : m.sending ? `<span aria-label="Envoi" style="opacity:.7">…</span>` :
    (m.read ? `<span aria-label="Lu" style="display:flex">${icon('check2', 15, { stroke: 2.2 })}</span>` : `<span aria-label="Envoyé" style="display:flex">${icon('check', 14, { stroke: 2.2 })}</span>`);
  const meta = `<span class="meta">${hhmm(m.at)}${status}</span>`;
  if (m.deleted) return `<div class="bubble" style="opacity:.6;font-style:italic">${icon('trash', 13)} Message supprimé${meta}</div>`;
  if (m.type === 'photo') {
    const src = m.media && m.media.url;
    return `<div class="bubble photo-msg">${src ? `<img src="${esc(src)}" alt="Photo" class="chat-img" data-media loading="lazy">` : `<div class="ph tone-${m.tone || 0}">${icon('image', 26)}</div>`}${quoteHTML(m) ? `<div style="padding:4px 4px 0">${quoteHTML(m)}</div>` : ''}<div style="padding:0 6px">${meta}</div></div>`;
  }
  if (m.type === 'video') {
    const src = m.media && m.media.url;
    return `<div class="bubble photo-msg">${src ? `<div class="chat-vid" data-media><video src="${esc(src)}#t=0.1" preload="metadata" playsinline muted></video><span class="vid-play">${icon('play', 22)}</span></div>` : `<div class="ph tone-1">${icon('play', 26)}</div>`}<div style="padding:0 6px">${meta}</div></div>`;
  }
  if (m.type === 'voice') {
    return `<div class="bubble"><div class="voice-msg"><button class="play" data-voice="${m.id}" aria-label="Écouter le message vocal">${icon('play', 14)}</button><span class="wave" style="color:${out ? '#fff' : 'var(--violet-soft)'}">${WAVE.map(h => `<i style="height:${h}px"></i>`).join('')}</span><span style="font-size:12px;font-weight:600">${fmtDuration(m.duration)}</span></div>${meta}</div>`;
  }
  return `<div class="bubble">${quoteHTML(m)}${esc(m.text)}${meta}</div>`;
}

export function renderChat(view) {
  view.classList.add('full');
  let replyTo = null;
  let recording = null;
  let lastCount = state.messages.length;

  view.innerHTML = `
    <div class="chat-head">
      ${avatar(state.partner, 44, { presence: state.partner.online === true })}
      <div class="col grow">
        <span style="font-size:16px;font-weight:700">${esc(state.partner.name)}</span>
        <span id="chatStatus" style="font-size:12px;font-weight:600"></span>
      </div>
      <button class="icon-btn" data-act="audio" aria-label="Appel audio">${icon('phone', 19)}</button>
      <button class="icon-btn" data-act="video" aria-label="Appel vidéo">${icon('video', 19)}</button>
    </div>
    <div class="chat-list" id="chatList" aria-live="polite"></div>
    <div id="replyBar"></div>
    <div id="composerWrap">
      <form class="composer" id="composer">
        <button type="button" class="icon-btn round" data-act="attach" aria-label="Envoyer une photo ou une vidéo">${icon('plus', 20, { stroke: 2.2 })}</button>
        <input id="msgInput" placeholder="Message…" autocomplete="off" maxlength="4000" enterkeyhint="send" aria-label="Message">
        <button type="button" class="icon-btn round grad" id="sendBtn" aria-label="Enregistrer un message vocal">${icon('mic', 19)}</button>
      </form>
    </div>`;

  const list = view.querySelector('#chatList');
  const $in = () => view.querySelector('#msgInput');
  const $btn = () => view.querySelector('#sendBtn');

  const renderStatus = () => {
    const el = view.querySelector('#chatStatus');
    if (!el) return;
    const p = state.partner;
    el.textContent = state.typing ? 'en train d’écrire…' : p.missing ? 'Pas encore dans l’espace' : p.online === true ? 'En ligne' : (p.status || 'Hors ligne');
    el.style.color = state.typing ? 'var(--violet-soft)' : 'var(--muted)';
  };

  const renderList = (keepPos) => {
    const prevH = list.scrollHeight, prevTop = list.scrollTop;
    const nearBottom = list.scrollHeight - list.scrollTop - list.clientHeight < 120;
    let html = state.hasOlder ? `<button class="chip" data-act="older" style="align-self:center">${icon('history', 14)}Messages plus anciens</button>` : '';
    if (!state.messages.length) html += `<div class="empty-state" style="margin-top:auto">${icon('chat', 28)}<span>Envoie le premier message à ${esc(state.partner.name)}</span></div>`;
    let lastDay = '';
    const isNew = state.messages.length > lastCount;
    state.messages.forEach((m, i) => {
      const d = startOfDay(m.at).getTime() + '';
      if (d !== lastDay) { html += `<span class="day-sep">${dayLabel(m.at)}</span>`; lastDay = d; }
      const hasReact = Object.values(m.reactions || {}).some(a => a.length);
      const fresh = isNew && i === state.messages.length - 1;
      html += `<div class="msg ${m.from === 'me' ? 'out' : 'in'}${hasReact ? ' has-react' : ''}${fresh ? ' new' : ''}" data-id="${m.id}">${bodyHTML(m)}${reactionsHTML(m)}</div>`;
    });
    if (state.typing) html += '<div class="typing" aria-label="En train d’écrire"><span></span><span></span><span></span></div>';
    list.innerHTML = html;
    if (keepPos) list.scrollTop = list.scrollHeight - prevH + prevTop;
    else if (nearBottom || state.messages.length > lastCount || lastCount === 0) list.scrollTop = list.scrollHeight;
    lastCount = state.messages.length;
  };

  const renderReply = () => {
    const bar = view.querySelector('#replyBar');
    const q = replyTo && state.messages.find(m => m.id === replyTo);
    if (!q) { bar.innerHTML = ''; return; }
    bar.innerHTML = `<div class="reply-bar"><span style="color:var(--violet-soft);display:flex">${icon('reply', 16)}</span><div class="col grow"><b style="font-size:12px">${q.from === 'me' ? 'Toi' : esc(state.partner.name)}</b><span class="ellipsis muted">${esc(what(q))}</span></div><button class="icon-btn plain" data-act="cancel-reply" aria-label="Annuler la réponse">${icon('x', 16)}</button></div>`;
  };

  const syncSendButton = () => {
    const inp = $in(), btn = $btn();
    if (!inp || !btn) return;
    const has = inp.value.trim().length > 0;
    btn.innerHTML = has ? icon('send', 19) : icon('mic', 19);
    btn.setAttribute('aria-label', has ? 'Envoyer' : 'Enregistrer un message vocal');
  };

  const doSend = async () => {
    const inp = $in();
    const text = inp ? inp.value.trim() : '';
    if (!text) return;
    const r = replyTo;
    inp.value = ''; replyTo = null; renderReply(); syncSendButton();
    try { await sendText(text, r); } catch (e) { toast(e.message, 4000); }
  };

  /* --- Enregistrement vocal --- */
  const showRecorder = () => {
    const wrap = view.querySelector('#composerWrap');
    wrap.innerHTML = `
      <div class="composer rec-bar">
        <button type="button" class="icon-btn round" data-rec="cancel" aria-label="Annuler l’enregistrement">${icon('trash', 18)}</button>
        <div class="grow row" style="gap:10px"><span class="rec-dot" id="recDot"></span><span id="recTime" style="font-weight:700;font-variant-numeric:tabular-nums">0:00</span><span class="muted small">Enregistrement…</span></div>
        <button type="button" class="icon-btn round grad" data-rec="send" aria-label="Envoyer le vocal">${icon('send', 19)}</button>
      </div>`;
  };
  const restoreComposer = () => {
    view.querySelector('#composerWrap').innerHTML = `
      <form class="composer" id="composer">
        <button type="button" class="icon-btn round" data-act="attach" aria-label="Envoyer une photo ou une vidéo">${icon('plus', 20, { stroke: 2.2 })}</button>
        <input id="msgInput" placeholder="Message…" autocomplete="off" maxlength="4000" enterkeyhint="send" aria-label="Message">
        <button type="button" class="icon-btn round grad" id="sendBtn" aria-label="Enregistrer un message vocal">${icon('mic', 19)}</button>
      </form>`;
    bindComposer();
  };
  const startVoice = async () => {
    if (!canRecord()) { toast('Vocaux indisponibles sur cet appareil'); return; }
    try {
      showRecorder();
      recording = await startRecording({
        onTick: s => { const t = view.querySelector('#recTime'); if (t) t.textContent = fmtDuration(s); },
        onLevel: l => { const d = view.querySelector('#recDot'); if (d) d.style.transform = `scale(${1 + l * 0.8})`; },
        onMax: () => finishVoice(true)
      });
    } catch (e) { recording = null; restoreComposer(); toast(e.message, 4000); }
  };
  const finishVoice = async send => {
    const r = recording; recording = null;
    if (!r) return;
    if (!send) { r.cancel(); restoreComposer(); return; }
    const { blob, duration } = await r.stop();
    restoreComposer();
    if (duration < 0.8) { toast('Vocal trop court'); return; }
    try { await sendVoice(blob, duration); } catch (e) { toast(e.message, 4000); }
  };

  /* --- Pièces jointes --- */
  const pickAttachment = () => {
    const inp = document.createElement('input');
    inp.type = 'file'; inp.accept = 'image/*,video/*'; inp.style.display = 'none';
    inp.addEventListener('change', async () => {
      const f = inp.files && inp.files[0]; inp.remove();
      if (!f) return;
      const r = replyTo; replyTo = null; renderReply();
      toast(f.type.startsWith('video') ? 'Envoi de la vidéo…' : 'Envoi de la photo…');
      try { await sendMediaFile(f, r); } catch (e) { toast(e.message, 4500); }
    });
    document.body.appendChild(inp); inp.click();
  };

  /* --- Lecture des vocaux --- */
  const playVoice = (btn, id) => {
    const m = state.messages.find(x => x.id === id);
    if (!m || !m.media || !m.media.url) { toast('Vocal indisponible'); return; }
    if (audioEl && audioEl.dataset.id === id && !audioEl.paused) { audioEl.pause(); return; }
    if (audioEl) audioEl.pause();
    audioEl = new Audio(m.media.url);
    audioEl.dataset.id = id;
    const setIcon = playing => { const b = view.querySelector(`[data-voice="${id}"]`); if (b) b.innerHTML = icon(playing ? 'pause' : 'play', 14); };
    audioEl.onplay = () => setIcon(true);
    audioEl.onpause = audioEl.onended = () => setIcon(false);
    audioEl.play().catch(() => toast('Lecture impossible'));
  };

  const openMessage = id => {
    const m = state.messages.find(x => x.id === id);
    if (!m || m.deleted || m.sending) return;
    const mine = m.from === 'me';
    const reacted = k => (m.reactions && m.reactions[k] || []).includes('me');
    openSheet({
      body: `
        <div class="react-row">${REACTIONS.map(r => `<button data-react="${r.key}" class="${reacted(r.key) ? 'on' : ''}" aria-label="${r.label}" style="color:${r.key === 'heart' ? 'var(--pink-soft)' : 'var(--violet-soft)'}">${icon(r.icon, 22)}</button>`).join('')}</div>
        <div class="action-list">
          <button data-a="reply">${icon('reply', 19)}Répondre</button>
          ${m.type === 'text' ? `<button data-a="copy">${icon('copy', 19)}Copier</button>` : ''}
          ${mine ? `<button data-a="delete" class="danger">${icon('trash', 19)}Supprimer pour nous deux</button>` : ''}
        </div>
        <span class="muted small" style="text-align:center">${mine ? (m.read ? 'Lu' : 'Envoyé') : 'Reçu'} à ${hhmm(m.at)}</span>`,
      onMount(sheet, close) {
        sheet.querySelectorAll('[data-react]').forEach(b => b.addEventListener('click', () => {
          close(); toggleReaction(id, b.dataset.react).catch(e => toast(e.message));
        }));
        sheet.querySelectorAll('[data-a]').forEach(b => b.addEventListener('click', async () => {
          const a = b.dataset.a; close();
          if (a === 'reply') { replyTo = id; renderReply(); const i = view.querySelector('#msgInput'); if (i) i.focus(); }
          if (a === 'copy') { try { await navigator.clipboard.writeText(m.text); toast('Message copié'); } catch (e) { toast('Copie impossible ici'); } }
          if (a === 'delete') deleteMessage(id).catch(e => toast(e.message));
        }));
      }
    });
  };

  function bindComposer() {
    const form = view.querySelector('#composer');
    form.addEventListener('submit', e => { e.preventDefault(); doSend(); });
    $in().addEventListener('input', () => { syncSendButton(); if ($in().value) notifyTyping(); });
    $btn().addEventListener('click', () => { if ($in().value.trim()) doSend(); else startVoice(); });
  }
  bindComposer();

  view.addEventListener('click', e => {
    const rec = e.target.closest('[data-rec]');
    if (rec) { finishVoice(rec.dataset.rec === 'send'); return; }
    const act = e.target.closest('[data-act]');
    if (act) {
      const a = act.dataset.act;
      if (a === 'audio') startCall('audio');
      if (a === 'video') startCall('video');
      if (a === 'attach') pickAttachment();
      if (a === 'cancel-reply') { replyTo = null; renderReply(); }
      if (a === 'older') { act.disabled = true; loadOlder().then(() => renderList(true)).catch(err => { toast(err.message); act.disabled = false; }); }
      return;
    }
    const v = e.target.closest('[data-voice]');
    if (v) { playVoice(v, v.dataset.voice); return; }
    const md = e.target.closest('[data-media]');
    if (md) { const m = state.messages.find(x => x.id === md.closest('.msg').dataset.id); if (m && m.media) openMediaPreview(m.media); return; }
    const msg = e.target.closest('.msg');
    if (msg) openMessage(msg.dataset.id);
  });

  renderStatus(); renderList(); renderReply(); syncSendButton();
  markRead().catch(() => {});

  const offs = [
    on('change:messages', () => { renderList(); if (!document.hidden) markRead().catch(() => {}); }),
    on('change:typing', () => { renderStatus(); renderList(); }),
    on('change:presence', renderStatus),
    on('change:all', () => renderList())
  ];
  return () => { offs.forEach(f => f()); if (recording) recording.cancel(); if (audioEl) audioEl.pause(); };
}
