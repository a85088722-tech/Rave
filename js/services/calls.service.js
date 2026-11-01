/**
 * Appels audio/vidéo avec LiveKit.
 * Le jeton d'accès est créé par la fonction serveur Supabase « livekit-token »
 * (la clé secrète LiveKit ne quitte jamais le serveur).
 */
import { getClient } from './supabase.js';
import { CONFIG } from '../config.js';

const SDK_URL = 'https://cdn.jsdelivr.net/npm/livekit-client@2/+esm';
let LK = null;

async function sdk() {
  if (!LK) LK = await import(SDK_URL);
  return LK;
}

async function fetchToken() {
  const sb = await getClient();
  const { data } = await sb.auth.getSession();
  if (!data.session) throw new Error('Session expirée, reconnecte-toi');
  const r = await fetch(`${CONFIG.SUPABASE_URL}/functions/v1/livekit-token`, {
    method: 'POST',
    headers: { Authorization: 'Bearer ' + data.session.access_token, apikey: CONFIG.SUPABASE_ANON_KEY, 'Content-Type': 'application/json' },
    body: '{}'
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok || !j.token) {
    if (r.status === 404) throw new Error('La fonction « livekit-token » n’est pas encore déployée dans Supabase (voir le guide LiveKit)');
    throw new Error('Appel impossible : ' + (j.error || r.status));
  }
  return j;
}

/**
 * Rejoint la salle d'appel de l'espace Duo.
 * handlers : onRemoteTrack(track, kind), onRemoteGone(), onState(text), onEnded()
 */
export async function joinCall({ video, handlers }) {
  if (CONFIG.DEMO) throw new Error('Les appels ne fonctionnent pas dans l’aperçu');
  const { Room, RoomEvent, Track } = await sdk();
  const { token, url } = await fetchToken();
  const room = new Room({ adaptiveStream: true, dynacast: true, audioCaptureDefaults: { echoCancellation: true, noiseSuppression: true } });

  room.on(RoomEvent.TrackSubscribed, track => handlers.onRemoteTrack(track, track.kind));
  room.on(RoomEvent.TrackUnsubscribed, track => track.detach().forEach(el => el.remove()));
  room.on(RoomEvent.ParticipantDisconnected, () => handlers.onRemoteGone());
  room.on(RoomEvent.Reconnecting, () => handlers.onState('Reconnexion…'));
  room.on(RoomEvent.Reconnected, () => handlers.onState(''));
  room.on(RoomEvent.Disconnected, () => handlers.onEnded());

  await room.connect(url || CONFIG.LIVEKIT_URL, token);
  try {
    await room.localParticipant.setMicrophoneEnabled(true);
    if (video) await room.localParticipant.setCameraEnabled(true, { facingMode: 'user' });
  } catch (e) {
    await room.disconnect();
    throw new Error(video ? 'Autorise la caméra et le micro pour l’appel vidéo' : 'Autorise le micro pour l’appel');
  }

  // Les pistes déjà présentes (si l'autre était là avant nous)
  room.remoteParticipants.forEach(p => p.trackPublications.forEach(pub => { if (pub.track) handlers.onRemoteTrack(pub.track, pub.track.kind); }));

  let facing = 'user';
  return {
    room,
    localVideoTrack: () => { const pub = room.localParticipant.getTrackPublication(Track.Source.Camera); return pub && pub.track; },
    setMic: on => room.localParticipant.setMicrophoneEnabled(on),
    setCamera: on => room.localParticipant.setCameraEnabled(on, { facingMode: facing }),
    switchCamera: async () => {
      facing = facing === 'user' ? 'environment' : 'user';
      const pub = room.localParticipant.getTrackPublication(Track.Source.Camera);
      if (pub && pub.track) await pub.track.restartTrack({ facingMode: facing });
      return facing;
    },
    leave: () => room.disconnect()
  };
}
