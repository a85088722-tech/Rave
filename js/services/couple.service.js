/**
 * Espace Duo : création, invitation (code de 8 caractères), rejoindre, membres.
 * Toutes les vérifications importantes sont faites côté serveur (fonctions SQL).
 */
import { getClient } from './supabase.js';
import { CONFIG } from '../config.js';
import { friendlyError } from './auth.service.js';
import { load, save, remove } from '../core/storage.js';

const demo = { couple: null, members: [] };
const INVITE_KEY = 'duo2.invite';

const REDEEM_ERRORS = {
  invalid_code: 'Code invalide, expiré ou déjà utilisé',
  too_many_attempts: 'Trop d’essais ratés. Réessaie dans une heure.',
  already_member: 'Tu fais déjà partie d’un espace Duo',
  couple_full: 'Cet espace Duo est déjà complet',
  not_authenticated: 'Connecte-toi d’abord'
};

/** Renvoie { couple, members: [{ user_id, role, profile }] } ou null si pas encore d'espace. */
export async function getMyCouple() {
  if (CONFIG.DEMO) return demo.couple ? { couple: demo.couple, members: demo.members } : null;
  const sb = await getClient();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) return null;
  const { data: mine, error: e1 } = await sb.from('couple_members').select('couple_id').eq('user_id', user.id).maybeSingle();
  if (e1) throw new Error(friendlyError(e1));
  if (!mine) return null;
  const [{ data: couple, error: e2 }, { data: members, error: e3 }] = await Promise.all([
    sb.from('couples').select('id, name, created_at').eq('id', mine.couple_id).single(),
    sb.from('couple_members').select('user_id, role, joined_at, profile:profiles(id, display_name, status, avatar_path, accent)').eq('couple_id', mine.couple_id)
  ]);
  if (e2 || e3) throw new Error(friendlyError(e2 || e3));
  return { couple, members, userId: user.id };
}

export async function createCouple(name) {
  if (CONFIG.DEMO) {
    demo.couple = { id: 'demo-couple', name: name || 'Notre Duo' };
    demo.members = [{ user_id: 'me', role: 'owner', profile: { id: 'me', display_name: 'Moi', status: '' } }];
    return demo.couple.id;
  }
  const sb = await getClient();
  const { data, error } = await sb.rpc('create_couple', { p_name: name || 'Notre Duo' });
  if (error) throw new Error(friendlyError(error));
  return data;
}

/** Nouveau code (l'ancien est révoqué). Le code est gardé sur cet appareil jusqu'à expiration. */
export async function createInvitation() {
  let inv;
  if (CONFIG.DEMO) {
    const a = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    inv = { code: Array.from({ length: 8 }, () => a[Math.floor(Math.random() * 32)]).join(''), expires_at: new Date(Date.now() + 864e5).toISOString() };
  } else {
    const sb = await getClient();
    const { data, error } = await sb.rpc('create_invitation');
    if (error) throw new Error(friendlyError(error));
    inv = Array.isArray(data) ? data[0] : data;
  }
  save(INVITE_KEY, inv);
  return inv;
}

/** Code créé sur cet appareil et encore valide, sinon null. */
export function storedInvitation() {
  const inv = load(INVITE_KEY, null);
  if (!inv || !inv.code || new Date(inv.expires_at) <= new Date()) return null;
  return inv;
}

export async function revokeInvitation() {
  remove(INVITE_KEY);
  if (CONFIG.DEMO) return;
  const sb = await getClient();
  const { error } = await sb.rpc('revoke_invitation');
  if (error) throw new Error(friendlyError(error));
}

export async function redeemInvitation(code) {
  if (CONFIG.DEMO) {
    if (String(code).replace(/[^A-Za-z0-9]/g, '').length !== 8) throw new Error(REDEEM_ERRORS.invalid_code);
    demo.couple = { id: 'demo-couple', name: 'Notre Duo' };
    demo.members = [
      { user_id: 'p', role: 'owner', profile: { id: 'p', display_name: 'Hafsa', status: 'En mode film ce soir' } },
      { user_id: 'me', role: 'partner', profile: { id: 'me', display_name: 'Moi', status: '' } }
    ];
    return demo.couple.id;
  }
  const sb = await getClient();
  const { data, error } = await sb.rpc('redeem_invitation', { p_code: code });
  if (error) throw new Error(friendlyError(error));
  if (!data || !data.ok) throw new Error(REDEEM_ERRORS[data && data.error] || 'Code refusé');
  remove(INVITE_KEY);
  return data.couple_id;
}

/** Appelle cb() quand quelqu'un rejoint l'espace. Renvoie la fonction pour arrêter. */
export function watchMembers(coupleId, cb) {
  if (CONFIG.DEMO) return () => {};
  let channel = null, sbRef = null, stopped = false;
  getClient().then(sb => {
    if (stopped) return;
    sbRef = sb;
    channel = sb.channel('members-' + coupleId)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'couple_members', filter: 'couple_id=eq.' + coupleId }, () => cb())
      .subscribe();
  }).catch(() => {});
  return () => { stopped = true; if (sbRef && channel) sbRef.removeChannel(channel); };
}
