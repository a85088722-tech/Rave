/**
 * Synchronisation : charge toutes les données de l'espace Duo puis ouvre le temps réel.
 * Les services s'enregistrent sur les tables en étant importés ici (avant connect()).
 */
import { CONFIG } from '../config.js';
import { loadMessages } from '../services/chat.service.js';
import { loadEvents } from '../services/calendar.service.js';
import { loadMemories } from '../services/memories.service.js';
import { loadQueue } from '../services/youtube.service.js';
import { loadTracks } from '../services/music.service.js';
import { connect } from '../services/realtime.js';
import { toast } from '../components/toast.js';
import '../features/video/call.js';
import '../features/together/player.js';

let started = false;

export async function loadAll() {
  const results = await Promise.allSettled([loadMessages(), loadEvents(), loadMemories(), loadQueue(), loadTracks()]);
  const failed = results.filter(r => r.status === 'rejected');
  if (failed.length) {
    console.warn(failed.map(f => f.reason));
    if (!navigator.onLine) toast('Hors connexion : affichage des dernières données enregistrées', 4000);
    else toast('Certaines données n’ont pas pu être chargées', 3500);
  }
}

export async function startSync() {
  if (CONFIG.DEMO || started) return;
  started = true;
  await loadAll();
  await connect();
}

// Au retour dans l'app ou du réseau : on rafraîchit (iOS coupe tout en arrière-plan)
let lastRefresh = Date.now();
async function refresh() {
  if (!started || Date.now() - lastRefresh < 15000) return;
  lastRefresh = Date.now();
  await loadAll();
}
document.addEventListener('visibilitychange', () => { if (!document.hidden) refresh(); });
window.addEventListener('online', () => { lastRefresh = 0; refresh(); connect().catch(() => {}); });
