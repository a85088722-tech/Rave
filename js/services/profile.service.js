/**
 * Profils : lecture, modification, photo (bucket privé « avatars »).
 */
import { getClient } from './supabase.js';
import { CONFIG } from '../config.js';
import { friendlyError } from './auth.service.js';

export async function updateMyProfile(patch) {
  if (CONFIG.DEMO) return;
  const sb = await getClient();
  const { data: { user } } = await sb.auth.getUser();
  const clean = {};
  if ('display_name' in patch) clean.display_name = String(patch.display_name).trim().slice(0, 24);
  if ('status' in patch) clean.status = String(patch.status || '').trim().slice(0, 60);
  if ('accent' in patch) clean.accent = patch.accent;
  if ('avatar_path' in patch) clean.avatar_path = patch.avatar_path;
  const { error } = await sb.from('profiles').update(clean).eq('id', user.id);
  if (error) throw new Error(friendlyError(error));
}

/** Envoie la photo de profil (Blob JPEG) et l'enregistre sur le profil. Renvoie un lien temporaire. */
export async function uploadAvatar(blob) {
  if (CONFIG.DEMO) return URL.createObjectURL(blob);
  const sb = await getClient();
  const { data: { user } } = await sb.auth.getUser();
  const path = `${user.id}/avatar-${Date.now()}.jpg`;
  const { error } = await sb.storage.from('avatars').upload(path, blob, { contentType: 'image/jpeg', upsert: true });
  if (error) throw new Error('Envoi de la photo impossible : ' + friendlyError(error));
  await updateMyProfile({ avatar_path: path });
  return signedAvatarUrl(path);
}

export async function signedAvatarUrl(path) {
  if (!path || CONFIG.DEMO) return '';
  const sb = await getClient();
  const { data, error } = await sb.storage.from('avatars').createSignedUrl(path, 60 * 60 * 12);
  return error ? '' : data.signedUrl;
}
