/**
 * État de l'application (une seule source pour tous les écrans).
 * - Aperçu (DEMO) : données d'exemple gardées sur l'appareil.
 * - Vraie app : rempli depuis Supabase, et gardé en cache sur l'appareil pour le mode hors connexion.
 */
import { demoData } from '../data/demo.js';
import { load, save } from './storage.js';
import { emit } from './events.js';
import { CONFIG } from '../config.js';

const KEY = CONFIG.DEMO ? 'duo2.demo' : 'duo2.cache';
const VERSION = 2;

export function emptyData() {
  return {
    v: VERSION,
    couple: null,
    me: { id: 'me', uid: null, name: '', status: '', photo: '' },
    partner: { id: 'p', uid: null, name: 'Ton duo', status: '', photo: '', online: false, missing: true },
    messages: [],
    hasOlder: false,
    events: [],
    memories: [],
    together: { now: null, queue: [], history: [] },
    music: { current: -1, playing: false, tracks: [] },
    typing: false
  };
}

function fresh() {
  if (CONFIG.DEMO) { const d = demoData(); d.v = VERSION; return d; }
  return emptyData();
}

const saved = load(KEY, null);
export const state = saved && saved.v === VERSION ? saved : fresh();
if (!CONFIG.DEMO) state.typing = false;

let saveTimer = null;
function persist() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    // Les liens signés expirent : on garde le reste, ils seront regénérés au chargement
    save(KEY, state);
  }, 300);
}

/** Modifie une partie de l'état, l'enregistre et prévient les écrans abonnés. */
export function update(section, fn) {
  fn(state);
  persist();
  emit('change:' + section, state);
}

export function resetDemo() {
  const d = fresh();
  Object.keys(state).forEach(k => delete state[k]);
  Object.assign(state, d);
  persist();
  emit('change:all', state);
}

/** Vide le cache (déconnexion). */
export function clearState() {
  const d = emptyData();
  Object.keys(state).forEach(k => delete state[k]);
  Object.assign(state, d);
  save(KEY, state);
}

export const unreadCount = () => state.messages.filter(m => m.from !== 'me' && !m.read && !m.deleted).length;
export const person = id => (id === 'me' ? state.me : state.partner);
export const keyOf = uid => (uid && uid === state.me.uid ? 'me' : 'p');
