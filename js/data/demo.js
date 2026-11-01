// Données d'exemple de la phase 2 (dates calculées à partir d'aujourd'hui).
import { dayKey } from '../core/utils.js';

const DAY = 864e5;
const MIN = 6e4;

export function demoData() {
  const now = Date.now();
  const t0 = new Date(); t0.setHours(9, 42, 0, 0);
  const base = Math.min(t0.getTime(), now - 5 * MIN);
  const oneYearAgo = new Date(); oneYearAgo.setFullYear(oneYearAgo.getFullYear() - 1); oneYearAgo.setHours(18, 0, 0, 0);

  const memories = [
    { id: 'y1', kind: 'photo', tone: 1, fav: true, caption: 'Photo d’exemple', at: oneYearAgo.getTime() },
    { id: 'y2', kind: 'photo', tone: 0, fav: false, caption: 'Photo d’exemple', at: oneYearAgo.getTime() + 20 * MIN }
  ];
  for (let i = 0; i < 10; i++) {
    memories.push({
      id: 'm' + i,
      kind: i === 3 || i === 7 ? 'video' : 'photo',
      dur: i === 3 ? 42 : 76,
      tone: i % 4,
      fav: i === 1 || i === 5,
      caption: i === 3 || i === 7 ? 'Vidéo d’exemple' : 'Photo d’exemple',
      at: now - (2 + i * 5) * DAY
    });
  }

  return {
    v: 2,
    couple: { id: 'demo-couple', name: 'Notre Duo', complete: true },
    me: { id: 'me', uid: 'me', name: 'Souhail', status: '', photo: '' },
    partner: { id: 'p', uid: 'p', name: 'Hafsa', status: 'En mode film ce soir', photo: '', online: true },

    messages: [
      { id: 'a1', from: 'p', type: 'voice', duration: 24, at: base - DAY, read: true, reactions: {} },
      { id: 'a2', from: 'p', type: 'text', text: 'Tu rentres à quelle heure ce soir ?', at: base, read: false, reactions: {} },
      { id: 'a3', from: 'p', type: 'photo', at: base + MIN, read: false, reactions: { heart: ['me'] } },
      { id: 'a4', from: 'me', type: 'text', text: 'Vers 19h, je te préviens', replyTo: 'a2', at: base + 2 * MIN, read: true, reactions: {} },
      { id: 'a5', from: 'me', type: 'voice', duration: 12, at: base + 3 * MIN, read: true, reactions: {} }
    ],

    events: [
      { id: 'e1', title: 'Week-end ensemble', type: 'voyage', date: dayKey(now + 13 * DAY), end: dayKey(now + 14 * DAY), time: '', desc: '' },
      { id: 'e2', title: 'Soirée film en visio', type: 'rdv', date: dayKey(now + 24 * DAY), time: '21:00', desc: '' },
      { id: 'e3', title: 'Exemple : anniversaire', type: 'anniv', date: dayKey(now + 40 * DAY), time: '', desc: 'Remplace-le par une vraie date' }
    ],

    memories,

    together: {
      current: null,
      queue: [
        { rowId: 'q1', id: 'dQw4w9WgXcQ', title: '[Titre de la vidéo]', channel: '[Chaîne]', by: 'me', dur: 1724, tone: 0 },
        { rowId: 'q2', id: 'dQw4w9WgXcQ', title: '[Titre de la vidéo]', channel: '[Chaîne]', by: 'p', dur: 3902, tone: 1 },
        { rowId: 'q3', id: 'dQw4w9WgXcQ', title: '[Titre de la vidéo]', channel: '[Chaîne]', by: 'me', dur: 1147, tone: 2 }
      ],
      history: [
        { rowId: 'h1', id: 'dQw4w9WgXcQ', title: '[Vidéo regardée hier]', channel: '[Chaîne]', by: 'p', dur: 1500, tone: 3, at: now - DAY }
      ]
    },

    music: {
      current: 0,
      playing: false,
      tracks: [
        { rowId: 't1', id: 'dQw4w9WgXcQ', title: '[Titre du morceau]', artist: '[Artiste]', by: 'me', tone: 1 },
        { rowId: 't2', id: 'dQw4w9WgXcQ', title: '[Titre du morceau]', artist: '[Artiste]', by: 'p', tone: 2 },
        { rowId: 't3', id: 'dQw4w9WgXcQ', title: '[Titre du morceau]', artist: '[Artiste]', by: 'p', tone: 0 },
        { rowId: 't4', id: 'dQw4w9WgXcQ', title: '[Titre du morceau]', artist: '[Artiste]', by: 'me', tone: 3 }
      ]
    },
    hasOlder: false,
    typing: false
  };
}
