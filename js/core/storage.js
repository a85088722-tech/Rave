// Accès au stockage local, protégé : sur certains iPhone il peut être plein ou indisponible.
export function load(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch (e) {
    return fallback;
  }
}

export function save(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
    return true;
  } catch (e) {
    return false;
  }
}

export function remove(key) {
  try { localStorage.removeItem(key); } catch (e) { /* rien */ }
}

/**
 * Migration : lit le profil de Duo 1 (clé "duo.profile") s'il existe sur cet appareil.
 * Rien n'est importé automatiquement : l'import sera proposé à la création du compte (phase 3).
 */
export function readLegacyProfile() {
  const p = load('duo.profile', null);
  if (!p || typeof p !== 'object' || !p.name) return null;
  return {
    name: String(p.name).slice(0, 24),
    status: String(p.status || '').slice(0, 60),
    photo: typeof p.photo === 'string' && p.photo.startsWith('data:image/') ? p.photo : '',
    accent: p.accent || ''
  };
}
