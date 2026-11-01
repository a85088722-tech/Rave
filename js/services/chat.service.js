/**
 * Messagerie : historique, envoi (texte, photo, vidéo, vocal), réactions, lu, suppression, « écrit ».
 * Aperçu (DEMO) : les mêmes fonctions modifient seulement les données locales.
 */
import { getClient } from './supabase.js';
import { state, update, keyOf } from '../core/state.js';
import { CONFIG } from '../config.js';
import { uid } from '../core/utils.js';
import { friendlyError } from './auth.service.js';
import { uploadMedia, signedUrls, mediaDuration } from './media.service.js';
import { onBroadcast, broadcast, onTable } from './realtime.js';
import { emit } from '../core/events.js';

const PAGE = 60;
const SELECT = 'id, sender_id, kind, body, media_id, reply_to, read_at, deleted_at, created_at, ' +
  'media:media(id, storage_path, kind, mime_type, duration_sec), reactions:message_reactions(user_id, reaction)';

function mapRow(row, urls = {}) {
  const reactions = {};
  (row.reactions || []).forEach(r => { (reactions[r.reaction] = reactions[r.reaction] || []).push(keyOf(r.user_id)); });
  const media = row.media ? { id: row.media.id, path: row.media.storage_path, kind: row.media.kind, mime: row.media.mime_type, url: urls[row.media.storage_path] || '' } : null;
  return {
    id: row.id,
    from: keyOf(row.sender_id),
    type: row.kind,
    text: row.body || '',
    replyTo: row.reply_to || undefined,
    at: Date.parse(row.created_at),
    read: !!row.read_at,
    deleted: !!row.deleted_at,
    reactions,
    media,
    duration: row.media && row.media.duration_sec ? Number(row.media.duration_sec) : undefined
  };
}

async function mapRows(rows) {
  const urls = await signedUrls(rows.map(r => r.media && r.media.storage_path).filter(Boolean));
  return rows.map(r => mapRow(r, urls));
}

function upsertLocal(msg) {
  update('messages', s => {
    const i = s.messages.findIndex(m => m.id === msg.id || (m.tempId && m.tempId === msg.tempId));
    if (i >= 0) s.messages[i] = Object.assign({}, s.messages[i], msg, { tempId: undefined, sending: false });
    else { s.messages.push(msg); s.messages.sort((a, b) => a.at - b.at); }
  });
}

/* ---------------- Chargement ---------------- */
export async function loadMessages() {
  if (CONFIG.DEMO) return;
  const sb = await getClient();
  const { data, error } = await sb.from('messages').select(SELECT).eq('couple_id', state.couple.id)
    .order('created_at', { ascending: false }).limit(PAGE);
  if (error) throw new Error(friendlyError(error));
  const msgs = (await mapRows(data)).reverse();
  update('messages', s => {
    const pending = s.messages.filter(m => m.sending);
    s.messages = msgs.concat(pending);
    s.hasOlder = data.length === PAGE;
  });
}

export async function loadOlder() {
  if (CONFIG.DEMO || !state.messages.length) return 0;
  const sb = await getClient();
  const oldest = new Date(state.messages[0].at).toISOString();
  const { data, error } = await sb.from('messages').select(SELECT).eq('couple_id', state.couple.id)
    .lt('created_at', oldest).order('created_at', { ascending: false }).limit(PAGE);
  if (error) throw new Error(friendlyError(error));
  const older = (await mapRows(data)).reverse();
  update('messages', s => { s.messages = older.concat(s.messages); s.hasOlder = data.length === PAGE; });
  return older.length;
}

async function refetch(id) {
  const sb = await getClient();
  const { data } = await sb.from('messages').select(SELECT).eq('id', id).maybeSingle();
  if (!data) { update('messages', s => { s.messages = s.messages.filter(m => m.id !== id); }); return; }
  const [m] = await mapRows([data]);
  upsertLocal(m);
}

/* ---------------- Envoi ---------------- */
export async function sendText(text, replyTo) {
  text = String(text || '').trim().slice(0, 4000);
  if (!text) return;
  const tempId = 'tmp-' + uid();
  const local = { id: tempId, tempId, from: 'me', type: 'text', text, replyTo, at: Date.now(), read: false, reactions: {}, sending: !CONFIG.DEMO };
  update('messages', s => s.messages.push(local));
  if (CONFIG.DEMO) {
    setTimeout(() => update('messages', s => { const m = s.messages.find(x => x.id === tempId); if (m) m.read = true; }), 1400);
    return;
  }
  try {
    const sb = await getClient();
    const { data, error } = await sb.from('messages').insert({
      couple_id: state.couple.id, sender_id: state.me.uid, kind: 'text', body: text, reply_to: replyTo || null
    }).select(SELECT).single();
    if (error) throw error;
    const [m] = await mapRows([data]);
    m.tempId = tempId;
    upsertLocal(m);
  } catch (e) {
    update('messages', s => { const m = s.messages.find(x => x.id === tempId); if (m) { m.sending = false; m.failed = true; } });
    throw new Error('Message non envoyé : ' + friendlyError(e));
  }
}

/** Photo ou vidéo choisie dans la galerie. */
export async function sendMediaFile(file, replyTo) {
  const kind = file.type.startsWith('video') ? 'video' : 'photo';
  if (CONFIG.DEMO) {
    update('messages', s => s.messages.push({ id: uid(), from: 'me', type: kind, at: Date.now(), read: false, reactions: {}, media: { kind, url: URL.createObjectURL(file) } }));
    return;
  }
  const tempId = 'tmp-' + uid();
  update('messages', s => s.messages.push({ id: tempId, tempId, from: 'me', type: kind, at: Date.now(), read: false, reactions: {}, sending: true, media: { kind, url: URL.createObjectURL(file) } }));
  try {
    const media = await uploadMedia(file, { kind });
    const sb = await getClient();
    const { data, error } = await sb.from('messages').insert({
      couple_id: state.couple.id, sender_id: state.me.uid, kind, media_id: media.id, reply_to: replyTo || null
    }).select(SELECT).single();
    if (error) throw error;
    const [m] = await mapRows([data]);
    m.tempId = tempId;
    upsertLocal(m);
  } catch (e) {
    update('messages', s => { s.messages = s.messages.filter(x => x.id !== tempId); });
    throw new Error(e.message || friendlyError(e));
  }
}

/** Message vocal enregistré (Blob audio). */
export async function sendVoice(blob, duration) {
  if (CONFIG.DEMO) {
    update('messages', s => s.messages.push({ id: uid(), from: 'me', type: 'voice', duration, at: Date.now(), read: false, reactions: {}, media: { kind: 'audio', url: URL.createObjectURL(blob) } }));
    return;
  }
  const tempId = 'tmp-' + uid();
  update('messages', s => s.messages.push({ id: tempId, tempId, from: 'me', type: 'voice', duration, at: Date.now(), read: false, reactions: {}, sending: true, media: { kind: 'audio', url: URL.createObjectURL(blob) } }));
  try {
    const file = new File([blob], 'vocal', { type: blob.type || 'audio/mp4' });
    const media = await uploadMedia(file, { kind: 'audio', duration });
    const sb = await getClient();
    const { data, error } = await sb.from('messages').insert({
      couple_id: state.couple.id, sender_id: state.me.uid, kind: 'voice', media_id: media.id
    }).select(SELECT).single();
    if (error) throw error;
    await sb.from('voice_messages').insert({ message_id: data.id, media_id: media.id, duration_sec: Math.max(0.1, Math.round(duration * 100) / 100) });
    const [m] = await mapRows([data]);
    m.tempId = tempId;
    upsertLocal(m);
  } catch (e) {
    update('messages', s => { s.messages = s.messages.filter(x => x.id !== tempId); });
    throw new Error('Vocal non envoyé : ' + (e.message || friendlyError(e)));
  }
}

/* ---------------- Réactions, lu, suppression ---------------- */
export async function toggleReaction(messageId, reaction) {
  const msg = state.messages.find(m => m.id === messageId);
  if (!msg) return;
  const had = (msg.reactions[reaction] || []).includes('me');
  update('messages', s => {
    const m = s.messages.find(x => x.id === messageId);
    const arr = m.reactions[reaction] || [];
    m.reactions[reaction] = had ? arr.filter(k => k !== 'me') : arr.concat('me');
  });
  if (CONFIG.DEMO) return;
  const sb = await getClient();
  const q = had
    ? sb.from('message_reactions').delete().match({ message_id: messageId, user_id: state.me.uid, reaction })
    : sb.from('message_reactions').insert({ message_id: messageId, user_id: state.me.uid, reaction });
  const { error } = await q;
  if (error) { await refetch(messageId); throw new Error(friendlyError(error)); }
}

export async function markRead() {
  if (!state.messages.some(m => m.from !== 'me' && !m.read)) return;
  update('messages', s => s.messages.forEach(m => { if (m.from !== 'me') m.read = true; }));
  if (CONFIG.DEMO) return;
  const sb = await getClient();
  await sb.rpc('mark_messages_read');
}

export async function deleteMessage(id) {
  update('messages', s => { const m = s.messages.find(x => x.id === id); if (m) { m.deleted = true; m.text = ''; m.media = null; } });
  if (CONFIG.DEMO) { update('messages', s => { s.messages = s.messages.filter(x => x.id !== id); }); return; }
  const sb = await getClient();
  const { error } = await sb.rpc('delete_message', { p_id: id });
  if (error) { await refetch(id); throw new Error(friendlyError(error)); }
}

/* ---------------- « En train d'écrire » ---------------- */
let lastTypingSent = 0;
let typingTimer = null;
export function notifyTyping() {
  if (Date.now() - lastTypingSent < 2500) return;
  lastTypingSent = Date.now();
  broadcast('typing', {});
}

onBroadcast('typing', () => {
  update('typing', s => { s.typing = true; });
  clearTimeout(typingTimer);
  typingTimer = setTimeout(() => update('typing', s => { s.typing = false; }), 4000);
});

/* ---------------- Temps réel ---------------- */
onTable('messages', payload => {
  const row = payload.new && payload.new.id ? payload.new : payload.old;
  if (!row || !row.id) return;
  if (payload.eventType === 'INSERT' && row.sender_id !== state.me.uid) {
    update('typing', s => { s.typing = false; });
    emit('chat:incoming', row);
  }
  refetch(row.id);
});

onTable('message_reactions', payload => {
  const row = payload.new && payload.new.message_id ? payload.new : payload.old;
  if (row && row.message_id && state.messages.some(m => m.id === row.message_id)) refetch(row.message_id);
}, { byCouple: false });

export { mediaDuration };
