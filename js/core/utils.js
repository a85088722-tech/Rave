const ESC = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
export const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ESC[c]);

export const uid = () => Math.random().toString(36).slice(2, 10) + Date.now().toString(36);

const DAY = 864e5;
export const MONTHS = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'];
export const DAYS = ['dimanche', 'lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi'];
const DAYS_SHORT = ['dim.', 'lun.', 'mar.', 'mer.', 'jeu.', 'ven.', 'sam.'];
const MONTHS_SHORT = ['janv.', 'févr.', 'mars', 'avr.', 'mai', 'juin', 'juil.', 'août', 'sept.', 'oct.', 'nov.', 'déc.'];

export const cap = s => s.charAt(0).toUpperCase() + s.slice(1);

export function hhmm(ts) {
  const d = new Date(ts);
  return String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0');
}

/** "2026-11-14" → Date locale à minuit (évite le décalage de fuseau de Date.parse). */
export function parseDay(str) {
  const [y, m, d] = String(str).split('-').map(Number);
  return new Date(y, (m || 1) - 1, d || 1);
}

export function dayKey(date) {
  const d = new Date(date);
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
}

export function startOfDay(date = new Date()) { const d = new Date(date); d.setHours(0, 0, 0, 0); return d; }

export function daysUntil(dayStr) {
  return Math.round((parseDay(dayStr) - startOfDay()) / DAY);
}

export function longDate(date) {
  const d = new Date(date);
  return cap(DAYS[d.getDay()]) + ' ' + d.getDate() + ' ' + MONTHS[d.getMonth()];
}

export function shortDate(date) {
  const d = new Date(date);
  return DAYS_SHORT[d.getDay()] + ' ' + d.getDate() + ' ' + MONTHS_SHORT[d.getMonth()];
}

export function dayLabel(ts) {
  const diff = Math.round((startOfDay(ts) - startOfDay()) / DAY);
  if (diff === 0) return "Aujourd'hui";
  if (diff === -1) return 'Hier';
  return longDate(ts);
}

export function relativeLabel(ts) {
  const diff = Math.round((startOfDay(ts) - startOfDay()) / DAY);
  if (diff === 0) return hhmm(ts);
  if (diff === -1) return 'Hier';
  return new Date(ts).getDate() + ' ' + MONTHS_SHORT[new Date(ts).getMonth()];
}

export function fmtDuration(sec) {
  sec = Math.max(0, Math.floor(sec || 0));
  const h = Math.floor(sec / 3600), m = Math.floor((sec % 3600) / 60), s = sec % 60;
  return (h ? h + ':' + String(m).padStart(2, '0') : m) + ':' + String(s).padStart(2, '0');
}

export function parseYouTube(url) {
  url = String(url || '').trim();
  if (/^[\w-]{11}$/.test(url)) return url;
  const m = url.match(/(?:youtu\.be\/|[?&]v=|\/shorts\/|\/embed\/|\/live\/)([\w-]{11})/);
  return m ? m[1] : null;
}
