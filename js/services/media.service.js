/**
 * Fichiers privés (photos, vidéos, vocaux) dans le bucket « media ».
 * Chemin : <couple_id>/<user_id>/<identifiant>.<ext>  — liens temporaires signés pour l'affichage.
 */
import { getClient } from './supabase.js';
import { state } from '../core/state.js';
import { friendlyError } from './auth.service.js';

const MAX_BYTES = 50 * 1024 * 1024;
const urlCache = new Map(); // path -> { url, exp }

const extFor = mime => ({
  'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'image/heic': 'heic',
  'video/mp4': 'mp4', 'video/quicktime': 'mov',
  'audio/mp4': 'm4a', 'audio/aac': 'aac', 'audio/mpeg': 'mp3', 'audio/webm': 'webm', 'audio/ogg': 'ogg'
}[mime] || 'bin');

/** Réduit une photo (max 1600 px) et la convertit en JPEG. */
export function compressImage(file, max = 1600, quality = 0.82) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      const scale = Math.min(1, max / Math.max(img.naturalWidth, img.naturalHeight));
      const w = Math.round(img.naturalWidth * scale), h = Math.round(img.naturalHeight * scale);
      const c = document.createElement('canvas');
      c.width = w; c.height = h;
      c.getContext('2d').drawImage(img, 0, 0, w, h);
      URL.revokeObjectURL(url);
      c.toBlob(b => (b ? resolve({ blob: b, width: w, height: h }) : reject(new Error('Photo illisible'))), 'image/jpeg', quality);
    };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('Format de photo non pris en charge')); };
    img.src = url;
  });
}

/** Durée d'une vidéo ou d'un audio (secondes), ou null. */
export function mediaDuration(file) {
  return new Promise(resolve => {
    const el = document.createElement(file.type.startsWith('audio') ? 'audio' : 'video');
    const url = URL.createObjectURL(file);
    el.preload = 'metadata';
    el.onloadedmetadata = () => { URL.revokeObjectURL(url); resolve(isFinite(el.duration) ? el.duration : null); };
    el.onerror = () => { URL.revokeObjectURL(url); resolve(null); };
    el.src = url;
  });
}

/**
 * Prépare puis envoie un fichier. Renvoie { id, path, kind, mime, url, duration }.
 * kind : 'photo' | 'video' | 'audio'
 */
export async function uploadMedia(file, { kind, duration } = {}) {
  const sb = await getClient();
  let blob = file, mime = file.type || 'application/octet-stream', width = null, height = null;
  if (!kind) kind = mime.startsWith('image') ? 'photo' : mime.startsWith('video') ? 'video' : 'audio';

  if (kind === 'photo') {
    const r = await compressImage(file);
    blob = r.blob; mime = 'image/jpeg'; width = r.width; height = r.height;
  }
  if (kind === 'video' && duration == null) duration = await mediaDuration(file);
  if (blob.size > MAX_BYTES) throw new Error('Fichier trop lourd (50 Mo maximum)');

  const path = `${state.couple.id}/${state.me.uid}/${crypto.randomUUID()}.${extFor(mime)}`;
  const { error: upErr } = await sb.storage.from('media').upload(path, blob, { contentType: mime, upsert: false });
  if (upErr) throw new Error('Envoi impossible : ' + friendlyError(upErr));

  const { data, error } = await sb.from('media').insert({
    couple_id: state.couple.id, uploader_id: state.me.uid, storage_path: path, kind,
    mime_type: mime, size_bytes: blob.size, width, height,
    duration_sec: duration != null ? Math.round(duration * 100) / 100 : null
  }).select('id').single();
  if (error) {
    await sb.storage.from('media').remove([path]);
    throw new Error(friendlyError(error));
  }
  return { id: data.id, path, kind, mime, url: URL.createObjectURL(blob), duration };
}

/** Liens signés (12 h) pour une liste de chemins, avec cache. */
export async function signedUrls(paths) {
  const out = {};
  const now = Date.now();
  const missing = [];
  paths.filter(Boolean).forEach(p => {
    const c = urlCache.get(p);
    if (c && c.exp > now + 60e3) out[p] = c.url; else missing.push(p);
  });
  if (missing.length) {
    const sb = await getClient();
    const { data } = await sb.storage.from('media').createSignedUrls(missing, 60 * 60 * 12);
    (data || []).forEach(d => {
      if (d.signedUrl) { out[d.path] = d.signedUrl; urlCache.set(d.path, { url: d.signedUrl, exp: now + 12 * 36e5 }); }
    });
  }
  return out;
}

export async function removeMedia(mediaId, path) {
  const sb = await getClient();
  await sb.from('media').delete().eq('id', mediaId);
  if (path) await sb.storage.from('media').remove([path]);
}
