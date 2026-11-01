/**
 * Notifications push (iPhone : iOS 16.4+, uniquement depuis l'app ajoutée à l'écran d'accueil).
 * L'abonnement de l'appareil est enregistré dans push_subscriptions ; l'envoi est fait par la
 * fonction serveur « push-notify » déclenchée à chaque nouveau message.
 */
import { getClient } from './supabase.js';
import { CONFIG } from '../config.js';
import { state } from '../core/state.js';
import { friendlyError } from './auth.service.js';

const isStandalone = () => window.navigator.standalone || matchMedia('(display-mode: standalone)').matches;

export function pushSupport() {
  if (CONFIG.DEMO) return { ok: false, reason: 'Les notifications fonctionnent dans la vraie app' };
  if (!('serviceWorker' in navigator) || !('PushManager' in window) || !('Notification' in window)) {
    return { ok: false, reason: /iPhone|iPad/.test(navigator.userAgent) && !isStandalone()
      ? 'Ajoute d’abord Duo à ton écran d’accueil, puis ouvre-le depuis l’icône'
      : 'Notifications non disponibles sur cet appareil' };
  }
  if (!CONFIG.VAPID_PUBLIC_KEY) return { ok: false, reason: 'Clé de notification manquante (config.js)' };
  return { ok: true };
}

export function pushPermission() { return 'Notification' in window ? Notification.permission : 'unsupported'; }

function b64ToBytes(b64) {
  const pad = '='.repeat((4 - (b64.length % 4)) % 4);
  const raw = atob((b64 + pad).replace(/-/g, '+').replace(/_/g, '/'));
  return Uint8Array.from(raw, c => c.charCodeAt(0));
}

/** Demande l'autorisation (doit être appelé après un appui) et enregistre l'appareil. */
export async function enablePush() {
  const sup = pushSupport();
  if (!sup.ok) throw new Error(sup.reason);
  const perm = await Notification.requestPermission();
  if (perm !== 'granted') throw new Error('Notifications refusées. Tu peux les autoriser dans Réglages > Notifications > Duo.');
  const reg = await navigator.serviceWorker.ready;
  let sub = await reg.pushManager.getSubscription();
  if (!sub) sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: b64ToBytes(CONFIG.VAPID_PUBLIC_KEY) });
  const j = sub.toJSON();
  const sb = await getClient();
  const { error } = await sb.from('push_subscriptions').upsert({
    user_id: state.me.uid, endpoint: j.endpoint, p256dh: j.keys.p256dh, auth: j.keys.auth, user_agent: navigator.userAgent.slice(0, 200)
  }, { onConflict: 'endpoint' });
  if (error) throw new Error(friendlyError(error));
}

export async function disablePush() {
  if (!('serviceWorker' in navigator)) return;
  const reg = await navigator.serviceWorker.ready;
  const sub = await reg.pushManager.getSubscription();
  if (!sub) return;
  const sb = await getClient();
  await sb.from('push_subscriptions').delete().eq('endpoint', sub.endpoint);
  await sub.unsubscribe();
}

export async function isPushEnabled() {
  if (!('serviceWorker' in navigator) || !('PushManager' in window)) return false;
  const reg = await navigator.serviceWorker.getRegistration();
  if (!reg) return false;
  return !!(await reg.pushManager.getSubscription());
}
