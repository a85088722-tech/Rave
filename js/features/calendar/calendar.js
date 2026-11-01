import { state } from '../../core/state.js';
import { saveEvent, deleteEvent } from '../../services/calendar.service.js';
import { on } from '../../core/events.js';
import { icon } from '../../components/icons.js';
import { openSheet } from '../../components/modal.js';
import { toast } from '../../components/toast.js';
import { esc, uid, MONTHS, cap, parseDay, dayKey, daysUntil, shortDate, startOfDay } from '../../core/utils.js';

export const EVENT_TYPES = {
  anniv: { label: 'Anniversaire', icon: 'gift', cls: 'ic-gold', color: 'var(--gold)' },
  rdv: { label: 'Rendez-vous', icon: 'heart', cls: 'ic-pink', color: 'var(--pink-soft)' },
  voyage: { label: 'Voyage', icon: 'plane', cls: 'ic-violet', color: 'var(--violet-soft)' },
  important: { label: 'Date importante', icon: 'star', cls: 'ic-cyan', color: 'var(--cyan)' }
};

const sortByDate = (a, b) => parseDay(a.date) - parseDay(b.date) || String(a.time).localeCompare(String(b.time));
const covers = (e, key) => key >= e.date && key <= (e.end || e.date);

function eventRow(e) {
  const t = EVENT_TYPES[e.type] || EVENT_TYPES.important;
  const n = daysUntil(e.date);
  const range = e.end && e.end !== e.date ? `${shortDate(parseDay(e.date))} – ${shortDate(parseDay(e.end))}` : shortDate(parseDay(e.date));
  return `
    <button class="card row" data-ev="${e.id}" style="padding:12px;text-align:left;width:100%">
      ${e.image && e.image.url ? `<img src="${esc(e.image.url)}" alt="" style="width:44px;height:44px;border-radius:13px;object-fit:cover;flex-shrink:0">` : `<div class="tile-ic ${t.cls}">${icon(t.icon, 20)}</div>`}
      <div class="col grow"><span class="title-sm ellipsis">${esc(e.title)}</span><span class="muted small ellipsis">${t.label} · ${range}${e.time ? ' · ' + esc(e.time) : ''}</span></div>
      <span style="font-size:12px;font-weight:700;color:${t.color}">${n === 0 ? 'Auj.' : n > 0 ? n + ' j' : 'Passé'}</span>
    </button>`;
}

function openEventForm(existing, presetDay) {
  const e = existing || { title: '', type: 'rdv', date: presetDay || dayKey(new Date()), end: '', time: '', desc: '' };
  openSheet({
    title: existing ? 'Modifier la date' : 'Nouvelle date',
    body: `
      <form class="form" id="evForm">
        <div class="stack"><label class="label" for="evTitle">Titre</label><input id="evTitle" class="field" maxlength="60" required placeholder="Ex : Week-end à Paris" value="${esc(e.title)}"></div>
        <div class="stack"><label class="label" for="evType">Type</label><select id="evType" class="field">${Object.entries(EVENT_TYPES).map(([k, t]) => `<option value="${k}" ${k === e.type ? 'selected' : ''}>${t.label}</option>`).join('')}</select></div>
        <div class="two">
          <div class="stack"><label class="label" for="evDate">Date</label><input id="evDate" class="field" type="date" required value="${esc(e.date)}"></div>
          <div class="stack"><label class="label" for="evTime">Heure</label><input id="evTime" class="field" type="time" value="${esc(e.time)}"></div>
        </div>
        <div class="stack"><label class="label" for="evEnd">Fin (facultatif, pour un voyage)</label><input id="evEnd" class="field" type="date" value="${esc(e.end || '')}"></div>
        <div class="stack"><label class="label" for="evDesc">Description</label><textarea id="evDesc" class="field" maxlength="300" placeholder="Facultatif">${esc(e.desc || '')}</textarea></div>
        <div class="stack"><span class="label">Image (facultatif)</span>
          <button type="button" class="btn glass block" data-act="img">${icon('image', 18)}<span id="imgLabel">${e.image ? 'Changer l\u2019image' : 'Ajouter une image'}</span></button>
          ${e.image && e.image.url ? `<img src="${esc(e.image.url)}" alt="" style="width:100%;max-height:160px;object-fit:cover;border-radius:14px">` : ''}
        </div>
        <button class="btn primary block" type="submit">${icon('check', 18)}${existing ? 'Enregistrer' : 'Ajouter'}</button>
        ${existing ? `<button type="button" class="btn danger block" data-act="del">${icon('trash', 18)}Supprimer</button>` : ''}
      </form>`,
    onMount(sheet, close) {
      let imageFile = null;
      sheet.querySelector('[data-act="img"]').addEventListener('click', () => {
        const inp = document.createElement('input'); inp.type = 'file'; inp.accept = 'image/*'; inp.style.display = 'none';
        inp.addEventListener('change', () => { imageFile = inp.files && inp.files[0]; if (imageFile) sheet.querySelector('#imgLabel').textContent = 'Image choisie : ' + (imageFile.name || 'photo'); inp.remove(); });
        document.body.appendChild(inp); inp.click();
      });
      sheet.querySelector('#evForm').addEventListener('submit', async ev => {
        ev.preventDefault();
        const val = id => sheet.querySelector(id).value.trim();
        const data = { title: val('#evTitle'), type: val('#evType'), date: val('#evDate'), time: val('#evTime'), end: val('#evEnd'), desc: val('#evDesc') };
        if (!data.title || !data.date) { toast('Titre et date obligatoires'); return; }
        if (data.end && data.end < data.date) { toast('La fin doit être après le début'); return; }
        const btn = sheet.querySelector('button[type=submit]'); btn.disabled = true;
        try {
          await saveEvent(existing, data, imageFile);
          toast(existing ? 'Date modifiée' : 'Date ajoutée');
          close();
        } catch (err) { btn.disabled = false; toast(err.message, 4500); }
      });
      const del = sheet.querySelector('[data-act="del"]');
      if (del) del.addEventListener('click', () => {
        if (!del.dataset.confirm) { del.dataset.confirm = '1'; del.lastChild.textContent = 'Toucher encore pour supprimer'; return; }
        deleteEvent(existing.id).then(() => toast('Date supprimée')).catch(err => toast(err.message));
        close();
      });
    }
  });
}

export function renderCalendar(view) {
  const today = startOfDay();
  let ym = { y: today.getFullYear(), m: today.getMonth() };
  let selected = null;
  let timer = null;

  const hero = () => {
    const next = state.events.filter(e => parseDay(e.date) >= today).sort(sortByDate)[0];
    if (!next) return `<button class="card pad row" data-act="add" style="width:100%;text-align:left"><div class="tile-ic ic-violet">${icon('calendar', 20)}</div><div class="col grow"><span class="title-sm">Aucune date à venir</span><span class="muted small">Ajoute votre prochain moment ensemble</span></div>${icon('plus', 18)}</button>`;
    const target = parseDay(next.date);
    if (next.time) { const [h, mi] = next.time.split(':').map(Number); target.setHours(h, mi); }
    const days = daysUntil(next.date);
    const ms = Math.max(0, target - Date.now());
    const box2 = next.time ? `<div class="box"><b style="font-size:17px;line-height:24px">${esc(next.time)}</b><span>${days > 0 ? 'heure' : 'dans ' + Math.floor(ms / 36e5) + ' h'}</span></div>` : '';
    const d = days;
    return `
      <button class="hero-count" data-ev="${next.id}" style="width:100%;text-align:left">
        <div class="col grow" style="gap:4px"><span style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:1px;opacity:.85">Compte à rebours</span><span style="font-size:19px;font-weight:800" class="ellipsis">${esc(next.title)}</span><span style="font-size:13px;opacity:.85">${cap(shortDate(target))}${next.time ? ' · ' + esc(next.time) : ''}</span></div>
        <div class="row" style="gap:6px">${d > 0 ? `<div class="box"><b>${d}</b><span>${d === 1 ? 'jour' : 'jours'}</span></div>` : `<div class="box"><b style="font-size:15px;line-height:24px">Auj.</b><span>c'est le jour</span></div>`}${box2}</div>
      </button>`;
  };

  const calendar = () => {
    const first = new Date(ym.y, ym.m, 1);
    const offset = (first.getDay() + 6) % 7; // semaine qui commence le lundi
    const nDays = new Date(ym.y, ym.m + 1, 0).getDate();
    let cells = '';
    for (let i = 0; i < offset; i++) cells += '<span></span>';
    for (let d = 1; d <= nDays; d++) {
      const key = dayKey(new Date(ym.y, ym.m, d));
      const evs = state.events.filter(e => covers(e, key));
      const isToday = key === dayKey(today);
      cells += `<button class="cal-day${isToday ? ' today' : ''}${selected === key ? ' sel' : ''}" data-day="${key}" aria-label="${d} ${MONTHS[ym.m]}${evs.length ? ', ' + evs.length + ' événement' + (evs.length > 1 ? 's' : '') : ''}"><span class="n">${d}</span><span class="dots">${evs.slice(0, 3).map(e => `<i style="background:${(EVENT_TYPES[e.type] || EVENT_TYPES.important).color}"></i>`).join('')}</span></button>`;
    }
    return `
      <div class="card pad col" style="gap:12px">
        <div class="cal-head">
          <button class="icon-btn round" data-act="prev" aria-label="Mois précédent" style="width:36px;height:36px;border:0;background:var(--surface-2)">${icon('left', 16)}</button>
          <span style="font-size:16px;font-weight:700">${cap(MONTHS[ym.m])} ${ym.y}</span>
          <button class="icon-btn round" data-act="nextm" aria-label="Mois suivant" style="width:36px;height:36px;border:0;background:var(--surface-2)">${icon('right', 16)}</button>
        </div>
        <div class="cal-dow"><span>L</span><span>M</span><span>M</span><span>J</span><span>V</span><span>S</span><span>D</span></div>
        <div class="cal-grid">${cells}</div>
      </div>`;
  };

  const listing = () => {
    if (selected) {
      const evs = state.events.filter(e => covers(e, selected)).sort(sortByDate);
      return `<div class="section-head"><h2>${cap(shortDate(parseDay(selected)))}</h2><button data-act="add-day">Ajouter</button></div>
        <div class="col" style="gap:10px">${evs.length ? evs.map(eventRow).join('') : '<div class="empty-state">Rien de prévu ce jour-là.</div>'}</div>`;
    }
    const up = state.events.filter(e => parseDay(e.end || e.date) >= today).sort(sortByDate);
    return `<div class="section-head"><h2>À venir</h2></div>
      <div class="col" style="gap:10px">${up.length ? up.map(eventRow).join('') : '<div class="empty-state">Aucune date à venir.</div>'}</div>`;
  };

  const render = () => {
    view.innerHTML = `
      <div class="page">
        <div class="page-head"><h1 class="page-title">Dates</h1><button class="icon-btn grad" data-act="add" aria-label="Ajouter une date">${icon('plus', 20, { stroke: 2.2 })}</button></div>
        <div id="hero">${hero()}</div>
        ${calendar()}
        ${listing()}
      </div>`;
  };

  const onClick = e => {
    const day = e.target.closest('[data-day]');
    if (day) { selected = selected === day.dataset.day ? null : day.dataset.day; render(); return; }
    const ev = e.target.closest('[data-ev]');
    if (ev) { openEventForm(state.events.find(x => x.id === ev.dataset.ev)); return; }
    const b = e.target.closest('[data-act]');
    if (!b) return;
    const a = b.dataset.act;
    if (a === 'add') openEventForm(null, selected);
    if (a === 'add-day') openEventForm(null, selected);
    if (a === 'prev') { ym.m--; if (ym.m < 0) { ym.m = 11; ym.y--; } selected = null; render(); }
    if (a === 'nextm') { ym.m++; if (ym.m > 11) { ym.m = 0; ym.y++; } selected = null; render(); }
  };

  render();
  view.addEventListener('click', onClick);
  timer = setInterval(() => { const h = view.querySelector('#hero'); if (h) h.innerHTML = hero(); }, 30000);
  const offs = ['change:events', 'change:all'].map(n => on(n, render));
  return () => { clearInterval(timer); view.removeEventListener('click', onClick); offs.forEach(f => f()); };
}
