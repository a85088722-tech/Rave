// Navigation sans rechargement, par l'ancre de l'adresse (#accueil, #chat…).
import { emit } from './events.js';

const routes = new Map();
let current = null;
let cleanup = null;
let fallback = 'accueil';

export function register(name, render) { routes.set(name, render); }
export const currentRoute = () => current;

export function go(name) {
  if (location.hash.slice(1) === name) render();
  else location.hash = name;
}

export function start(defaultRoute) {
  fallback = defaultRoute;
  window.addEventListener('hashchange', render);
  render();
}

function render() {
  const wanted = location.hash.slice(1);
  const name = routes.has(wanted) ? wanted : fallback;
  if (wanted !== name) { history.replaceState(null, '', '#' + name); }
  if (cleanup) { try { cleanup(); } catch (e) { console.error(e); } }
  cleanup = null;

  const view = document.getElementById('view');
  view.className = '';
  view.innerHTML = '';
  void view.offsetWidth; // relance l'animation d'entrée
  view.classList.add('enter');
  view.scrollTop = 0;

  cleanup = routes.get(name)(view) || null;
  current = name;
  emit('route', name);
}
