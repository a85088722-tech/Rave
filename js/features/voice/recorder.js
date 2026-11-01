/**
 * Enregistrement de messages vocaux (MediaRecorder).
 * iPhone : audio/mp4 ; Android/Chrome : audio/webm.
 */
const MAX_SEC = 300;

function pickMime() {
  if (typeof MediaRecorder === 'undefined') return null;
  const types = ['audio/mp4', 'audio/webm;codecs=opus', 'audio/webm', 'audio/ogg;codecs=opus'];
  return types.find(t => MediaRecorder.isTypeSupported && MediaRecorder.isTypeSupported(t)) || '';
}

export function canRecord() {
  return !!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia && typeof MediaRecorder !== 'undefined');
}

/**
 * Démarre un enregistrement. Renvoie { stop(): Promise<{blob, duration}>, cancel(), elapsed() }.
 * onTick(sec) est appelé chaque seconde ; onLevel(0..1) pour l'animation.
 */
export async function startRecording({ onTick, onLevel, onMax } = {}) {
  if (!canRecord()) throw new Error('L’enregistrement audio n’est pas disponible sur cet appareil');
  let stream;
  try {
    stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } });
  } catch (e) {
    throw new Error('Autorise le micro pour enregistrer un vocal');
  }
  const mime = pickMime();
  const rec = new MediaRecorder(stream, mime ? { mimeType: mime } : undefined);
  const chunks = [];
  rec.ondataavailable = e => { if (e.data && e.data.size) chunks.push(e.data); };
  const t0 = Date.now();
  rec.start(250);

  // Niveau sonore pour l'animation
  let ac = null, raf = null;
  try {
    ac = new (window.AudioContext || window.webkitAudioContext)();
    const src = ac.createMediaStreamSource(stream), an = ac.createAnalyser();
    an.fftSize = 256; src.connect(an);
    const buf = new Uint8Array(an.fftSize);
    const loop = () => {
      an.getByteTimeDomainData(buf);
      let sum = 0; for (let i = 0; i < buf.length; i++) { const d = (buf[i] - 128) / 128; sum += d * d; }
      if (onLevel) onLevel(Math.min(1, Math.sqrt(sum / buf.length) * 4));
      raf = requestAnimationFrame(loop);
    };
    loop();
  } catch (e) { /* animation facultative */ }

  const tick = setInterval(() => {
    const s = Math.floor((Date.now() - t0) / 1000);
    if (onTick) onTick(s);
    if (s >= MAX_SEC && onMax) onMax();
  }, 1000);

  const release = () => {
    clearInterval(tick);
    if (raf) cancelAnimationFrame(raf);
    if (ac) ac.close().catch(() => {});
    stream.getTracks().forEach(t => t.stop());
  };

  return {
    elapsed: () => (Date.now() - t0) / 1000,
    stop: () => new Promise(resolve => {
      const duration = (Date.now() - t0) / 1000;
      rec.onstop = () => { release(); resolve({ blob: new Blob(chunks, { type: rec.mimeType || mime || 'audio/mp4' }), duration }); };
      rec.stop();
    }),
    cancel: () => { rec.onstop = release; try { rec.stop(); } catch (e) { release(); } }
  };
}
