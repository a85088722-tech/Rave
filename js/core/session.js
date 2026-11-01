/**
 * Session : charge l'espace Duo et les deux profils depuis Supabase dans l'état de l'app.
 */
import { update } from './state.js';
import { getMyCouple } from '../services/couple.service.js';
import { signedAvatarUrl } from '../services/profile.service.js';
import { CONFIG } from '../config.js';

export async function loadCouple() {
  const c = await getMyCouple();
  if (!c) return null;
  const meId = c.userId || 'me';
  const meM = c.members.find(m => m.user_id === meId);
  const pM = c.members.find(m => m.user_id !== meId);
  const [meUrl, pUrl] = await Promise.all([
    signedAvatarUrl(meM && meM.profile && meM.profile.avatar_path),
    signedAvatarUrl(pM && pM.profile && pM.profile.avatar_path)
  ]);
  update('profile', s => {
    s.couple = { id: c.couple.id, name: c.couple.name, complete: c.members.length >= 2 };
    if (!CONFIG.DEMO && meM) {
      s.me = Object.assign({}, s.me, { id: 'me', uid: meId, name: meM.profile.display_name, status: meM.profile.status || '', photo: meUrl || '' });
    }
    s.partner = pM
      ? Object.assign({}, s.partner, { id: 'p', uid: pM.user_id, name: pM.profile.display_name, status: pM.profile.status || '', photo: pUrl || s.partner.photo || '', online: CONFIG.DEMO ? true : undefined, missing: false })
      : { id: 'p', name: 'Ton duo', status: '', photo: '', online: undefined, missing: true };
  });
  return c;
}
