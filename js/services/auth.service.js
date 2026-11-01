/**
 * Comptes : inscription, connexion, déconnexion, mot de passe oublié.
 * En mode DEMO, tout est simulé localement (aucun réseau).
 */
import { getClient } from './supabase.js';
import { CONFIG } from '../config.js';

const demo = { user: null };
const appUrl = () => location.origin + location.pathname;

/** Traduit les erreurs Supabase en messages clairs. */
export function friendlyError(err) {
  const msg = String((err && (err.message || err.error_description)) || err || '');
  const code = err && err.code;
  if (/invalid login credentials/i.test(msg)) return 'Email ou mot de passe incorrect';
  if (/already registered|already been registered/i.test(msg) || code === 'user_already_exists') return 'Un compte existe déjà avec cet email';
  if (/password should be at least|weak_password/i.test(msg)) return 'Mot de passe trop court (8 caractères minimum)';
  if (/not.authorized|email_address_not_authorized/i.test(msg) || code === 'email_address_not_authorized') return 'Supabase refuse d’envoyer l’email. Désactive « Confirm email » dans Supabase (voir le guide).';
  if (/rate limit|too many/i.test(msg) || code === 'over_email_send_rate_limit') return 'Trop de tentatives, réessaie dans quelques minutes';
  if (/email not confirmed/i.test(msg)) return 'Email pas encore confirmé. Désactive « Confirm email » dans Supabase ou confirme l’email.';
  if (/invalid.*email|email.*invalid/i.test(msg)) return 'Adresse email invalide';
  if (/fetch|network|failed to/i.test(msg)) return 'Connexion impossible. Vérifie ton réseau.';
  return msg || 'Une erreur est survenue';
}

export async function currentUser() {
  if (CONFIG.DEMO) return demo.user;
  const sb = await getClient();
  const { data } = await sb.auth.getSession();
  return data.session ? data.session.user : null;
}

export async function signUp({ email, password, name }) {
  if (CONFIG.DEMO) { demo.user = { id: 'me', email }; return { user: demo.user, needsConfirm: false }; }
  const sb = await getClient();
  const { data, error } = await sb.auth.signUp({
    email, password,
    options: { data: { display_name: name }, emailRedirectTo: appUrl() }
  });
  if (error) throw new Error(friendlyError(error));
  // Supabase renvoie un utilisateur sans identités si l'email existe déjà
  if (data.user && Array.isArray(data.user.identities) && data.user.identities.length === 0) {
    throw new Error('Un compte existe déjà avec cet email');
  }
  return { user: data.user, needsConfirm: !data.session };
}

export async function signIn({ email, password }) {
  if (CONFIG.DEMO) { demo.user = { id: 'me', email }; return demo.user; }
  const sb = await getClient();
  const { data, error } = await sb.auth.signInWithPassword({ email, password });
  if (error) throw new Error(friendlyError(error));
  return data.user;
}

export async function signOut() {
  if (CONFIG.DEMO) { demo.user = null; return; }
  const sb = await getClient();
  await sb.auth.signOut();
}

export async function sendPasswordReset(email) {
  if (CONFIG.DEMO) return;
  const sb = await getClient();
  const { error } = await sb.auth.resetPasswordForEmail(email, { redirectTo: appUrl() });
  if (error) throw new Error(friendlyError(error));
}

export async function updatePassword(password) {
  if (CONFIG.DEMO) return;
  const sb = await getClient();
  const { error } = await sb.auth.updateUser({ password });
  if (error) throw new Error(friendlyError(error));
}

/** Prévient de la déconnexion, de la récupération de mot de passe, etc. */
export function onAuthChange(cb) {
  if (CONFIG.DEMO) return () => {};
  let sub = null;
  getClient().then(sb => { sub = sb.auth.onAuthStateChange((event, session) => cb(event, session)).data.subscription; }).catch(() => {});
  return () => { if (sub) sub.unsubscribe(); };
}
