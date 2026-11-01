/** Calendrier partagé (table calendar_events). */
import { getClient } from './supabase.js';
import { state, update, keyOf } from '../core/state.js';
import { CONFIG } from '../config.js';
import { uid } from '../core/utils.js';
import { friendlyError } from './auth.service.js';
import { uploadMedia, signedUrls } from './media.service.js';
import { onTable } from './realtime.js';

const SELECT = 'id, title, type, start_date, end_date, start_time, description, created_by, image:media(id, storage_path)';

function mapRow(r, urls) {
  return {
    id: r.id, title: r.title, type: r.type, date: r.start_date, end: r.end_date || '',
    time: r.start_time ? r.start_time.slice(0, 5) : '', desc: r.description || '', by: keyOf(r.created_by),
    image: r.image ? { id: r.image.id, path: r.image.storage_path, url: urls[r.image.storage_path] || '' } : null
  };
}

export async function loadEvents() {
  if (CONFIG.DEMO) return;
  const sb = await getClient();
  const { data, error } = await sb.from('calendar_events').select(SELECT).eq('couple_id', state.couple.id).order('start_date');
  if (error) throw new Error(friendlyError(error));
  const urls = await signedUrls(data.map(r => r.image && r.image.storage_path).filter(Boolean));
  update('events', s => { s.events = data.map(r => mapRow(r, urls)); });
}

/** data : { title, type, date, end, time, desc } ; imageFile facultatif. */
export async function saveEvent(existing, data, imageFile) {
  if (CONFIG.DEMO) {
    update('events', s => {
      const img = imageFile ? { url: URL.createObjectURL(imageFile) } : undefined;
      if (existing) Object.assign(s.events.find(x => x.id === existing.id), data, img ? { image: img } : {});
      else s.events.push(Object.assign({ id: uid(), image: img || null }, data));
    });
    return;
  }
  const sb = await getClient();
  let imageId = existing && existing.image ? existing.image.id : null;
  if (imageFile) imageId = (await uploadMedia(imageFile, { kind: 'photo' })).id;
  const row = {
    title: data.title, type: data.type, start_date: data.date, end_date: data.end || null,
    start_time: data.time || null, description: data.desc || null, image_media_id: imageId
  };
  const q = existing
    ? sb.from('calendar_events').update(row).eq('id', existing.id)
    : sb.from('calendar_events').insert(Object.assign({ couple_id: state.couple.id, created_by: state.me.uid }, row));
  const { error } = await q;
  if (error) throw new Error(friendlyError(error));
  await loadEvents();
}

export async function deleteEvent(id) {
  update('events', s => { s.events = s.events.filter(x => x.id !== id); });
  if (CONFIG.DEMO) return;
  const sb = await getClient();
  const { error } = await sb.from('calendar_events').delete().eq('id', id);
  if (error) { await loadEvents(); throw new Error(friendlyError(error)); }
}

onTable('calendar_events', () => { loadEvents().catch(() => {}); });
