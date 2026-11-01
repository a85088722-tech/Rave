/** Souvenirs : galerie privée (tables memories + media). */
import { getClient } from './supabase.js';
import { state, update, keyOf } from '../core/state.js';
import { CONFIG } from '../config.js';
import { uid } from '../core/utils.js';
import { friendlyError } from './auth.service.js';
import { uploadMedia, signedUrls, removeMedia } from './media.service.js';
import { onTable } from './realtime.js';
import { toast } from '../components/toast.js';

const SELECT = 'id, caption, taken_at, is_favorite, added_by, media:media(id, storage_path, kind, duration_sec, uploader_id)';

function mapRow(r, urls) {
  const m = r.media || {};
  return {
    id: r.id, kind: m.kind === 'video' ? 'video' : 'photo', at: Date.parse(r.taken_at), fav: r.is_favorite,
    caption: r.caption || '', url: urls[m.storage_path] || '', mediaId: m.id, path: m.storage_path,
    dur: m.duration_sec ? Number(m.duration_sec) : 0, by: keyOf(r.added_by), mine: m.uploader_id === state.me.uid,
    tone: Math.abs(String(r.id).charCodeAt(0)) % 4
  };
}

export async function loadMemories() {
  if (CONFIG.DEMO) return;
  const sb = await getClient();
  const { data, error } = await sb.from('memories').select(SELECT).eq('couple_id', state.couple.id).order('taken_at', { ascending: false }).limit(1000);
  if (error) throw new Error(friendlyError(error));
  const urls = await signedUrls(data.map(r => r.media && r.media.storage_path).filter(Boolean));
  update('memories', s => { s.memories = data.map(r => mapRow(r, urls)); });
}

/** Ajoute plusieurs photos/vidéos. La date du souvenir = date du fichier. */
export async function addMemories(files) {
  const list = Array.from(files || []);
  if (!list.length) return 0;
  if (CONFIG.DEMO) {
    update('memories', s => list.forEach(f => s.memories.push({
      id: uid(), kind: f.type.startsWith('video') ? 'video' : 'photo', at: f.lastModified || Date.now(),
      fav: false, caption: '', url: URL.createObjectURL(f), tone: 0, by: 'me', mine: true
    })));
    return list.length;
  }
  const sb = await getClient();
  let done = 0;
  for (const f of list) {
    try {
      toast(`Envoi ${done + 1} sur ${list.length}…`, 60000);
      const media = await uploadMedia(f);
      const { error } = await sb.from('memories').insert({
        couple_id: state.couple.id, media_id: media.id, added_by: state.me.uid,
        taken_at: new Date(f.lastModified || Date.now()).toISOString()
      });
      if (error) throw new Error(friendlyError(error));
      done++;
    } catch (e) { toast(`${f.name || 'Fichier'} : ${e.message}`, 4500); }
  }
  await loadMemories();
  toast(done === list.length ? `${done} souvenir${done > 1 ? 's' : ''} ajouté${done > 1 ? 's' : ''}` : `${done} sur ${list.length} ajoutés`);
  return done;
}

export async function toggleFavorite(id) {
  let fav = false;
  update('memories', s => { const m = s.memories.find(x => x.id === id); if (m) { m.fav = !m.fav; fav = m.fav; } });
  if (CONFIG.DEMO) return fav;
  const sb = await getClient();
  const { error } = await sb.from('memories').update({ is_favorite: fav }).eq('id', id);
  if (error) { await loadMemories(); throw new Error(friendlyError(error)); }
  return fav;
}

export async function deleteMemory(id) {
  const m = state.memories.find(x => x.id === id);
  update('memories', s => { s.memories = s.memories.filter(x => x.id !== id); });
  if (CONFIG.DEMO || !m) return;
  const sb = await getClient();
  const { error } = await sb.from('memories').delete().eq('id', id);
  if (error) { await loadMemories(); throw new Error(friendlyError(error)); }
  if (m.mine && m.mediaId) await removeMedia(m.mediaId, m.path).catch(() => {});
}

onTable('memories', () => { loadMemories().catch(() => {}); });
