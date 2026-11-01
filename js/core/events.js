// Petit bus d'événements : les écrans s'abonnent aux changements de l'état.
const listeners = new Map();

export function on(name, fn) {
  if (!listeners.has(name)) listeners.set(name, new Set());
  listeners.get(name).add(fn);
  return () => off(name, fn);
}

export function off(name, fn) {
  const set = listeners.get(name);
  if (set) set.delete(fn);
}

export function emit(name, payload) {
  for (const key of [name, '*']) {
    const set = listeners.get(key);
    if (set) set.forEach(fn => { try { fn(payload, name); } catch (e) { console.error(e); } });
  }
}
