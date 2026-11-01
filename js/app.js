/**
 * Duo 2.0 — point d'entrée.
 * 1. Vérifie la session (Supabase)  2. Charge l'espace Duo  3. Ouvre l'app ou le parcours d'arrivée.
 */
import { register, start } from './core/router.js';
import { mountNavbar } from './components/navbar.js';
import { renderHome } from './features/home/home.js';
import { renderChat } from './features/chat/chat.js';
import { renderTogether } from './features/together/together.js';
import { renderCalendar } from './features/calendar/calendar.js';
import { renderMemories } from './features/memories/memories.js';
import { startOnboarding } from './features/onboarding/onboarding.js';
import { currentUser, onAuthChange } from './services/auth.service.js';
import { loadCouple } from './core/session.js';
import { state, clearState } from './core/state.js';
import { startSync } from './core/sync.js';
import { disconnect } from './services/realtime.js';
import { CONFIG } from './config.js';
import { esc } from './core/utils.js';

register('accueil', renderHome);
register('chat', renderChat);
register('ensemble', renderTogether);
register('dates', renderCalendar);
register('souvenirs', renderMemories);

let appStarted = false;

function enterApp() {
  document.body.classList.remove('onboarding');
  if (!appStarted) {
    appStarted = true;
    mountNavbar(document.getElementById('navbar'));
    start('accueil');
    startSync().catch(e => console.warn(e));
  } else {
    // relance l'écran courant pour afficher les nouvelles infos
    window.dispatchEvent(new HashChangeEvent('hashchange'));
  }
}

function splash(text = '') {
  document.body.classList.add('onboarding');
  document.getElementById('view').innerHTML = `<div class="ob" style="justify-content:center;align-items:center;gap:14px"><span class="wordmark" style="font-size:40px">Duo</span>${text ? `<span class="muted small">${esc(text)}</span>` : ''}</div>`;
}

function fatal(message) {
  document.body.classList.add('onboarding');
  const v = document.getElementById('view');
  v.innerHTML = `<div class="ob" style="justify-content:center;gap:16px;text-align:center"><span class="wordmark" style="font-size:40px">Duo</span><p class="muted">${esc(message)}</p><button class="btn primary block" id="retry">Réessayer</button></div>`;
  v.querySelector('#retry').addEventListener('click', () => location.reload());
}

/** Après connexion : espace Duo existant ? partenaire présent ? */
export async function afterAuth() {
  splash('Chargement de ton espace…');
  const c = await loadCouple();
  if (!c) { startOnboarding('choice', { onDone: () => afterAuth().catch(e => fatal(e.message)) }); return; }
  enterApp();
}

async function boot() {
  if (CONFIG.DEMO) {
    // Aperçu : commence par le parcours d'arrivée (simulé), sauf si un écran de l'app est demandé
    const appRoutes = ['#accueil', '#chat', '#ensemble', '#dates', '#souvenirs'];
    if (appRoutes.includes(location.hash)) enterApp();
    else startOnboarding('welcome', { onDone: () => afterAuth() });
    return;
  }
  splash();
  try {
    const user = await currentUser();
    if (!user) { startOnboarding('welcome', { onDone: () => afterAuth().catch(e => fatal(e.message)) }); return; }
    await afterAuth();
  } catch (e) {
    fatal(e.message || 'Impossible de démarrer');
  }
}

onAuthChange(event => {
  if (event === 'SIGNED_OUT') { disconnect().finally(() => { clearState(); location.reload(); }); }
  if (event === 'PASSWORD_RECOVERY') startOnboarding('newpass', { onDone: () => afterAuth().catch(e => fatal(e.message)) });
});

boot();

// Bloque le zoom (pincement, double appui) comme dans Duo 1
['gesturestart', 'gesturechange', 'gestureend'].forEach(ev => document.addEventListener(ev, e => e.preventDefault(), { passive: false }));
document.addEventListener('touchmove', e => { if (e.scale && e.scale !== 1) e.preventDefault(); }, { passive: false });

// Service worker : hors connexion + mises à jour (seulement sur le vrai site)
if (!CONFIG.DEMO && 'serviceWorker' in navigator) {
  navigator.serviceWorker.register('sw.js').then(reg => {
    const offer = worker => {
      if (document.querySelector('.update-bar')) return;
      const bar = document.createElement('div');
      bar.className = 'update-bar';
      bar.innerHTML = '<span class="grow" style="font-size:14px;font-weight:600">Nouvelle version de Duo disponible</span><button class="btn primary" style="height:38px;font-size:13px">Mettre à jour</button>';
      bar.querySelector('button').addEventListener('click', () => worker.postMessage('skipWaiting'));
      document.body.appendChild(bar);
    };
    if (reg.waiting && navigator.serviceWorker.controller) offer(reg.waiting);
    reg.addEventListener('updatefound', () => {
      const w = reg.installing;
      if (w) w.addEventListener('statechange', () => { if (w.state === 'installed' && navigator.serviceWorker.controller) offer(w); });
    });
    document.addEventListener('visibilitychange', () => { if (!document.hidden) reg.update().catch(() => {}); });
  }).catch(() => {});
  let reloading = false;
  navigator.serviceWorker.addEventListener('controllerchange', () => { if (!reloading) { reloading = true; location.reload(); } });
  // Ouvrir le chat depuis une notification
  navigator.serviceWorker.addEventListener('message', e => { if (e.data && e.data.open) location.hash = e.data.open; });
}

// Exposé pour le débogage dans la console
window.__duo = { state };
