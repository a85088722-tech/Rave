/**
 * Client Supabase, chargé à la demande.
 * Seule la clé publique (publishable / anon) est utilisée ici : la sécurité repose sur la RLS.
 */
import { CONFIG } from '../config.js';

const SDK_URL = 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm';
let clientPromise = null;

export function getClient() {
  if (CONFIG.DEMO) return Promise.resolve(null);
  if (!CONFIG.SUPABASE_URL || !CONFIG.SUPABASE_ANON_KEY) {
    return Promise.reject(new Error('Supabase n’est pas configuré (js/config.js)'));
  }
  if (!clientPromise) {
    clientPromise = import(SDK_URL)
      .then(({ createClient }) => createClient(CONFIG.SUPABASE_URL, CONFIG.SUPABASE_ANON_KEY, {
        auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true, storageKey: 'duo2.auth' }
      }))
      .catch(err => { clientPromise = null; throw new Error('Impossible de joindre le serveur. Vérifie ta connexion.'); });
  }
  return clientPromise;
}
