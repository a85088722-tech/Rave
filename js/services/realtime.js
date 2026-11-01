/**
 * Canal temps réel privé de l'espace Duo : « couple:<id> ».
 * - broadcast : messages éphémères (écrit, synchro YouTube, appels)
 * - presence  : qui est en ligne
 * - postgres_changes : nouvelles lignes en base (messages, dates…)
 */
import { getClient } from './supabase.js';
import { state, update } from '../core/state.js';
import { CONFIG } from '../config.js';
import { emit } from '../core/events.js';

let channel = null;
let dbChannel = null;
let sb = null;
const handlers = new Map(); // event -> Set(fn)
const dbHandlers = [];

export function onBroadcast(event, fn) {
  if (!handlers.has(event)) handlers.set(event, new Set());
  handlers.get(event).add(fn);
  return () => handlers.get(event).delete(fn);
}

export function broadcast(event, payload = {}) {
  if (CONFIG.DEMO || !channel) return;
  channel.send({ type: 'broadcast', event, payload: Object.assign({ from: state.me.uid, at: Date.now() }, payload) });
}

/** Enregistre un écouteur sur une table (à appeler avant connect()). */
export function onTable(table, fn, opts = {}) {
  dbHandlers.push({ table, fn, opts });
}

export function isPartnerOnline() { return !!state.partner.online; }

// Une seule connexion à la fois : startSync, le retour dans l'app et le retour du réseau
// pouvaient lancer connect() en même temps et laisser des canaux en double
// (messages reçus deux fois, présence faussée).
let connecting = null;
export function connect() {
  if (CONFIG.DEMO || !state.couple) return Promise.resolve();
  if (!connecting) connecting = doConnect().finally(() => { connecting = null; });
  return connecting;
}

async function doConnect() {
  sb = await getClient();
  await disconnect();
  const cid = state.couple.id;
  // Le jeton de session doit être transmis au temps réel pour les canaux privés
  const { data } = await sb.auth.getSession();
  if (data.session) sb.realtime.setAuth(data.session.access_token);

  const ch = channel = sb.channel('couple:' + cid, { config: { private: true, broadcast: { self: false }, presence: { key: state.me.uid } } });
  channel.on('broadcast', { event: '*' }, ({ event, payload }) => {
    if (ch !== channel || !payload || typeof payload !== 'object') return;
    if (payload.from === state.me.uid) return;
    const set = handlers.get(event);
    if (set) set.forEach(fn => { try { fn(payload); } catch (e) { console.error(e); } });
  });
  channel.on('presence', { event: 'sync' }, () => {
    if (ch !== channel) return;
    const st = ch.presenceState();
    const online = !!(state.partner.uid && st[state.partner.uid]);
    if (online !== state.partner.online) update('presence', s => { s.partner.online = online; });
    emit('presence', online);
  });
  channel.subscribe(async status => {
    if (ch !== channel) return;
    if (status === 'SUBSCRIBED') {
      await ch.track({ uid: state.me.uid, at: Date.now() });
      emit('realtime:ready');
    }
  });

  dbChannel = sb.channel('db:' + cid);
  dbHandlers.forEach(({ table, fn, opts }) => {
    const cfg = { event: opts.event || '*', schema: 'public', table };
    if (opts.byCouple !== false) cfg.filter = 'couple_id=eq.' + cid;
    dbChannel.on('postgres_changes', cfg, payload => { try { fn(payload); } catch (e) { console.error(e); } });
  });
  dbChannel.subscribe();
}

export async function disconnect() {
  if (!sb) return;
  if (channel) { try { await sb.removeChannel(channel); } catch (e) { /* rien */ } channel = null; }
  if (dbChannel) { try { await sb.removeChannel(dbChannel); } catch (e) { /* rien */ } dbChannel = null; }
}

// Retour dans l'app : on se reconnecte si iOS a coupé le canal
document.addEventListener('visibilitychange', () => {
  if (document.hidden || CONFIG.DEMO || !state.couple) return;
  if (!channel || channel.state !== 'joined') connect().then(() => emit('realtime:resume')).catch(() => {});
  else emit('realtime:resume');
});
