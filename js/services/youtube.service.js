/**
 * YouTube : file d'attente et historique (table youtube_queue), recherche, titres.
 * La lecture synchronisée elle-même est dans js/features/together/player.js.
 */
import { getClient } from './supabase.js';
import { state, update, keyOf } from '../core/state.js';
import { CONFIG } from '../config.js';
import { uid } from '../core/utils.js';
import { friendlyError } from './auth.service.js';
import { onTable } from './realtime.js';

function mapRow(r) {
  return { rowId: r.id, pos: r.position, id: r.youtube_id, title: r.title, channel: r.channel || '', dur: r.duration_sec || 0, thumb: r.thumbnail_url || `https://i.ytimg.com/vi/${r.youtube_id}/mqdefault.jpg`, by: keyOf(r.added_by), at: r.played_at ? Date.parse(r.played_at) : Date.parse(r.created_at), status: r.status };
}

/** Titre et chaîne d'une vidéo, sans clé API (service public noembed). */
export async function fetchVideoInfo(ytId) {
  try {
    const r = await fetch('https://noembed.com/embed?url=' + encodeURIComponent('https://www.youtube.com/watch?v=' + ytId));
    const j = await r.json();
    if (j && j.title) return { title: j.title.slice(0, 200), channel: (j.author_name || '').slice(0, 120), thumb: j.thumbnail_url || '' };
  } catch (e) { /* hors ligne ou bloqué */ }
  return { title: 'Vidéo YouTube', channel: '', thumb: '' };
}

/** Recherche par mots-clés (nécessite CONFIG.YOUTUBE_API_KEY). */
export async function searchYouTube(q) {
  if (!CONFIG.YOUTUBE_API_KEY) throw new Error('Ajoute une clé API YouTube dans js/config.js pour chercher par mots-clés. En attendant, colle un lien.');
  const url = `https://www.googleapis.com/youtube/v3/search?part=snippet&type=video&maxResults=12&safeSearch=none&q=${encodeURIComponent(q)}&key=${CONFIG.YOUTUBE_API_KEY}`;
  const r = await fetch(url);
  const j = await r.json();
  if (j.error) throw new Error(j.error.code === 403 ? 'Quota YouTube atteint ou clé refusée' : j.error.message);
  return (j.items || []).map(it => ({
    id: it.id.videoId,
    title: decodeEntities(it.snippet.title),
    channel: decodeEntities(it.snippet.channelTitle),
    thumb: (it.snippet.thumbnails.medium || it.snippet.thumbnails.default || {}).url
  }));
}
function decodeEntities(s) { const t = document.createElement('textarea'); t.innerHTML = s || ''; return t.value; }

export async function loadQueue() {
  if (CONFIG.DEMO) return;
  const sb = await getClient();
  const { data, error } = await sb.from('youtube_queue').select('*').eq('couple_id', state.couple.id).order('position').order('created_at');
  if (error) throw new Error(friendlyError(error));
  const rows = data.map(mapRow);
  update('together', s => {
    s.together.queue = rows.filter(r => r.status === 'queued');
    s.together.history = rows.filter(r => r.status === 'played').sort((a, b) => b.at - a.at).slice(0, 30);
    const playing = rows.filter(r => r.status === 'playing').sort((a, b) => b.at - a.at)[0];
    s.together.current = playing || null;
  });
}

export async function addToQueue(item) {
  if (CONFIG.DEMO) {
    update('together', s => s.together.queue.push(Object.assign({ rowId: uid(), by: 'me', dur: 0, tone: Math.floor(Math.random() * 4) }, item)));
    return;
  }
  const sb = await getClient();
  const maxPos = state.together.queue.reduce((m, q) => Math.max(m, q.pos || 0), 0);
  const { error } = await sb.from('youtube_queue').insert({
    couple_id: state.couple.id, youtube_id: item.id, title: (item.title || 'Vidéo YouTube').slice(0, 200),
    channel: item.channel || null, thumbnail_url: item.thumb || null, position: maxPos + 1, added_by: state.me.uid
  });
  if (error) throw new Error(friendlyError(error));
  await loadQueue();
}

export async function removeFromQueue(rowId) {
  update('together', s => { s.together.queue = s.together.queue.filter(q => q.rowId !== rowId); });
  if (CONFIG.DEMO) return;
  const sb = await getClient();
  await sb.from('youtube_queue').delete().eq('id', rowId);
}

/** Marque une ligne comme « en cours » (et l'ancienne comme regardée). */
export async function markPlaying(rowId) {
  if (CONFIG.DEMO || !rowId) return;
  const sb = await getClient();
  await sb.from('youtube_queue').update({ status: 'played', played_at: new Date().toISOString() }).eq('couple_id', state.couple.id).eq('status', 'playing');
  await sb.from('youtube_queue').update({ status: 'playing', played_at: new Date().toISOString() }).eq('id', rowId).eq('status', 'queued');
  await loadQueue();
}

/** Ajoute une vidéo lancée directement (sans passer par la file) à l'historique. */
export async function recordDirectPlay(item) {
  if (CONFIG.DEMO) return;
  const sb = await getClient();
  await sb.from('youtube_queue').update({ status: 'played', played_at: new Date().toISOString() }).eq('couple_id', state.couple.id).eq('status', 'playing');
  await sb.from('youtube_queue').insert({
    couple_id: state.couple.id, youtube_id: item.id, title: (item.title || 'Vidéo YouTube').slice(0, 200), channel: item.channel || null,
    thumbnail_url: item.thumb || null, status: 'playing', played_at: new Date().toISOString(), added_by: state.me.uid
  });
  await loadQueue();
}

export async function updateTitle(ytId, title) {
  if (CONFIG.DEMO || !title) return;
  const sb = await getClient();
  await sb.from('youtube_queue').update({ title: title.slice(0, 200) }).eq('couple_id', state.couple.id).eq('youtube_id', ytId).eq('title', 'Vidéo YouTube');
}

onTable('youtube_queue', () => { loadQueue().catch(() => {}); });
