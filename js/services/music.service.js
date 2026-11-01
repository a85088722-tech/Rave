/** Musique : playlist partagée (tables playlists + playlist_tracks), lue via YouTube. */
import { getClient } from './supabase.js';
import { state, update, keyOf } from '../core/state.js';
import { CONFIG } from '../config.js';
import { uid } from '../core/utils.js';
import { friendlyError } from './auth.service.js';
import { onTable } from './realtime.js';

let playlistId = null;

async function ensurePlaylist(sb) {
  if (playlistId) return playlistId;
  const { data } = await sb.from('playlists').select('id').eq('couple_id', state.couple.id).order('created_at').limit(1);
  if (data && data.length) playlistId = data[0].id;
  else {
    const { data: created, error } = await sb.from('playlists').insert({ couple_id: state.couple.id }).select('id').single();
    if (error) throw new Error(friendlyError(error));
    playlistId = created.id;
  }
  return playlistId;
}

export async function loadTracks() {
  if (CONFIG.DEMO) return;
  const sb = await getClient();
  const pid = await ensurePlaylist(sb);
  const { data, error } = await sb.from('playlist_tracks').select('*').eq('playlist_id', pid).order('position').order('created_at');
  if (error) throw new Error(friendlyError(error));
  update('music', s => {
    const currentId = s.music.tracks[s.music.current] && s.music.tracks[s.music.current].rowId;
    s.music.tracks = data.map(r => ({ rowId: r.id, id: r.youtube_id, title: r.title, artist: r.artist || '', thumb: r.thumbnail_url || `https://i.ytimg.com/vi/${r.youtube_id}/mqdefault.jpg`, by: keyOf(r.added_by), pos: r.position }));
    const i = s.music.tracks.findIndex(t => t.rowId === currentId);
    s.music.current = i >= 0 ? i : (s.music.tracks.length ? Math.min(Math.max(s.music.current, 0), s.music.tracks.length - 1) : -1);
  });
}

export async function addTrack(item) {
  if (CONFIG.DEMO) {
    update('music', s => { s.music.tracks.push(Object.assign({ rowId: uid(), by: 'me', tone: Math.floor(Math.random() * 4) }, item)); if (s.music.current < 0) s.music.current = 0; });
    return;
  }
  const sb = await getClient();
  const pid = await ensurePlaylist(sb);
  const maxPos = state.music.tracks.reduce((m, t) => Math.max(m, t.pos || 0), 0);
  const { error } = await sb.from('playlist_tracks').insert({
    playlist_id: pid, youtube_id: item.id, title: (item.title || 'Morceau').slice(0, 200), artist: item.artist || null,
    thumbnail_url: item.thumb || null, position: maxPos + 1, added_by: state.me.uid
  });
  if (error) throw new Error(friendlyError(error));
  await loadTracks();
}

export async function removeTrack(rowId) {
  update('music', s => {
    const i = s.music.tracks.findIndex(t => t.rowId === rowId);
    if (i < 0) return;
    s.music.tracks.splice(i, 1);
    if (i < s.music.current) s.music.current--;
    if (s.music.current >= s.music.tracks.length) s.music.current = s.music.tracks.length - 1;
  });
  if (CONFIG.DEMO) return;
  const sb = await getClient();
  await sb.from('playlist_tracks').delete().eq('id', rowId);
}

onTable('playlist_tracks', () => { loadTracks().catch(() => {}); }, { byCouple: false });
