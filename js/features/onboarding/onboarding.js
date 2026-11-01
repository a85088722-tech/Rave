/**
 * Parcours d'arrivée : bienvenue → compte → espace Duo (créer ou rejoindre) → invitation.
 */
import { icon } from '../../components/icons.js';
import { toast } from '../../components/toast.js';
import { esc } from '../../core/utils.js';
import { update } from '../../core/state.js';
import { readLegacyProfile, save, load } from '../../core/storage.js';
import { squareJpeg } from '../../core/media.js';
import { signUp, signIn, sendPasswordReset, updatePassword } from '../../services/auth.service.js';
import { updateMyProfile, uploadAvatar } from '../../services/profile.service.js';
import { createCouple, createInvitation, storedInvitation, redeemInvitation, revokeInvitation, watchMembers } from '../../services/couple.service.js';
import { CONFIG } from '../../config.js';

const LOGO = `<svg width="72" height="72" viewBox="0 0 72 72" aria-hidden="true"><rect width="72" height="72" rx="22" fill="#13121B"/><circle cx="29" cy="36" r="15" fill="none" stroke="#8B5CF6" stroke-width="3.2"/><circle cx="43" cy="36" r="15" fill="none" stroke="#EC4899" stroke-width="3.2"/><path d="M32.5 29.5v13l10-6.5z" fill="#F5F3FF"/></svg>`;

let ctx = { view: null, onDone: null, coupleId: null, stopWatch: null, timer: null };

function cleanupStep() {
  if (ctx.stopWatch) { ctx.stopWatch(); ctx.stopWatch = null; }
  if (ctx.timer) { clearInterval(ctx.timer); ctx.timer = null; }
}

export function startOnboarding(step, { onDone, coupleId } = {}) {
  ctx.view = document.getElementById('view');
  if (onDone) ctx.onDone = onDone;
  if (coupleId) ctx.coupleId = coupleId;
  document.body.classList.add('onboarding');
  go(step);
}

function finish() {
  cleanupStep();
  document.body.classList.remove('onboarding');
  if (ctx.onDone) ctx.onDone();
}

function go(step) {
  cleanupStep();
  const v = ctx.view;
  v.className = 'enter';
  v.scrollTop = 0;
  ({ welcome, signup, login, forgot, newpass, choice, join, invite })[step](v);
}

function busy(btn, on, label) {
  if (!btn) return;
  btn.disabled = on;
  if (on) { btn.dataset.label = btn.innerHTML; btn.innerHTML = label || 'Patiente…'; }
  else if (btn.dataset.label) btn.innerHTML = btn.dataset.label;
}

function shell(inner, back) {
  return `<div class="ob">${back ? `<button class="icon-btn round ob-back" data-back="${back}" aria-label="Retour">${icon('left', 18)}</button>` : ''}${inner}</div>`;
}

function bindBack(v) {
  v.querySelectorAll('[data-back]').forEach(b => b.addEventListener('click', () => go(b.dataset.back)));
}

/* ---------------- Bienvenue ---------------- */
function welcome(v) {
  v.innerHTML = shell(`
    <div class="ob-hero">
      ${LOGO}
      <h1 class="wordmark" style="font-size:44px">Duo</h1>
      <p class="muted" style="font-size:16px;line-height:1.5;max-width:300px">Votre espace privé, rien qu'à vous deux : messages, vidéos, dates et souvenirs.</p>
    </div>
    <div class="ob-actions">
      <button class="btn primary block" data-go="signup">Créer mon compte</button>
      <button class="btn glass block" data-go="login">J'ai déjà un compte</button>
    </div>`);
  v.querySelectorAll('[data-go]').forEach(b => b.addEventListener('click', () => go(b.dataset.go)));
}

/* ---------------- Inscription ---------------- */
function signup(v) {
  const legacy = readLegacyProfile();
  v.innerHTML = shell(`
    <div class="ob-head"><span class="kicker">Étape 1 sur 2</span><h1 class="page-title">Crée ton compte</h1></div>
    ${legacy ? `
      <label class="card pad row ob-legacy">
        ${legacy.photo ? `<img class="avatar" src="${esc(legacy.photo)}" alt="" style="width:48px;height:48px">` : `<span class="avatar" style="width:48px;height:48px">${esc(legacy.name.charAt(0))}</span>`}
        <div class="col grow"><span class="title-sm">Profil Duo 1 trouvé</span><span class="muted small">Reprendre ${esc(legacy.name)}${legacy.photo ? ', la photo' : ''}${legacy.status ? ' et le statut' : ''}</span></div>
        <input type="checkbox" id="useLegacy" checked style="width:22px;height:22px;accent-color:#8B5CF6">
      </label>` : ''}
    <form class="form" id="f" novalidate>
      <div class="stack"><label class="label" for="name">Prénom</label><input id="name" class="field" maxlength="24" autocomplete="given-name" value="${legacy ? esc(legacy.name) : ''}" required></div>
      <div class="stack"><label class="label" for="email">Email</label><input id="email" class="field" type="email" autocomplete="email" inputmode="email" autocapitalize="off" required></div>
      <div class="stack"><label class="label" for="pw">Mot de passe</label><input id="pw" class="field" type="password" minlength="8" autocomplete="new-password" required><span class="muted small">8 caractères minimum</span></div>
      <button class="btn primary block" type="submit">Créer mon compte</button>
    </form>
    <p class="muted small" style="text-align:center">Déjà inscrit ? <button class="link" data-go="login">Se connecter</button></p>`, 'welcome');
  bindBack(v);
  v.querySelector('[data-go]').addEventListener('click', () => go('login'));
  v.querySelector('#f').addEventListener('submit', async e => {
    e.preventDefault();
    const name = v.querySelector('#name').value.trim();
    const email = v.querySelector('#email').value.trim();
    const pw = v.querySelector('#pw').value;
    if (!name) return toast('Indique ton prénom');
    if (!/^\S+@\S+\.\S+$/.test(email)) return toast('Adresse email invalide');
    if (pw.length < 8) return toast('Mot de passe : 8 caractères minimum');
    const btn = e.submitter || v.querySelector('button[type=submit]');
    busy(btn, true, 'Création du compte…');
    try {
      const res = await signUp({ email, password: pw, name });
      if (res.needsConfirm) {
        busy(btn, false);
        toast('Confirme ton email, puis connecte-toi. (Ou désactive « Confirm email » dans Supabase.)', 6000);
        go('login');
        return;
      }
      update('profile', s => { s.me.name = name; });
      const useLegacy = legacy && v.querySelector('#useLegacy') && v.querySelector('#useLegacy').checked;
      if (useLegacy) await importLegacy(legacy);
      go('choice');
    } catch (err) {
      busy(btn, false);
      toast(err.message, 4500);
    }
  });
}

/** Import réel du profil Duo 1 (statut + photo) dans le compte. */
async function importLegacy(legacy) {
  try {
    if (legacy.status) await updateMyProfile({ status: legacy.status });
    if (legacy.photo) {
      const blob = await squareJpeg(legacy.photo, 320);
      const url = await uploadAvatar(blob);
      update('profile', s => { s.me.photo = url; });
    }
    update('profile', s => { if (legacy.status) s.me.status = legacy.status; });
    save('duo2.legacyImported', true);
    toast('Profil Duo 1 importé');
  } catch (e) {
    toast('Import du profil Duo 1 incomplet : ' + e.message, 4500);
  }
}

/* ---------------- Connexion ---------------- */
function login(v) {
  v.innerHTML = shell(`
    <div class="ob-head"><h1 class="page-title">Content de te revoir</h1><p class="muted">Connecte-toi pour retrouver ton espace Duo.</p></div>
    <form class="form" id="f" novalidate>
      <div class="stack"><label class="label" for="email">Email</label><input id="email" class="field" type="email" autocomplete="email" inputmode="email" autocapitalize="off" required></div>
      <div class="stack"><label class="label" for="pw">Mot de passe</label><input id="pw" class="field" type="password" autocomplete="current-password" required></div>
      <button class="btn primary block" type="submit">Se connecter</button>
    </form>
    <p class="muted small" style="text-align:center"><button class="link" data-go="forgot">Mot de passe oublié ?</button></p>`, 'welcome');
  bindBack(v);
  v.querySelector('[data-go]').addEventListener('click', () => go('forgot'));
  v.querySelector('#f').addEventListener('submit', async e => {
    e.preventDefault();
    const btn = v.querySelector('button[type=submit]');
    busy(btn, true, 'Connexion…');
    try {
      await signIn({ email: v.querySelector('#email').value.trim(), password: v.querySelector('#pw').value });
      finish();
    } catch (err) { busy(btn, false); toast(err.message, 4500); }
  });
}

/* ---------------- Mot de passe oublié ---------------- */
function forgot(v) {
  v.innerHTML = shell(`
    <div class="ob-head"><h1 class="page-title">Mot de passe oublié</h1><p class="muted">Tu recevras un lien par email pour en choisir un nouveau.</p></div>
    <form class="form" id="f" novalidate>
      <div class="stack"><label class="label" for="email">Email du compte</label><input id="email" class="field" type="email" autocomplete="email" inputmode="email" autocapitalize="off" required></div>
      <button class="btn primary block" type="submit">Envoyer le lien</button>
    </form>
    <div class="card pad"><span class="small" style="color:var(--text-2);line-height:1.5">Sans service d’email configuré dans Supabase, ce lien n’arrive qu’aux adresses de ton équipe Supabase. Voir le guide (SMTP).</span></div>`, 'login');
  bindBack(v);
  v.querySelector('#f').addEventListener('submit', async e => {
    e.preventDefault();
    const btn = v.querySelector('button[type=submit]');
    busy(btn, true, 'Envoi…');
    try { await sendPasswordReset(v.querySelector('#email').value.trim()); toast('Si un compte existe, un email est parti', 4500); go('login'); }
    catch (err) { busy(btn, false); toast(err.message, 5000); }
  });
}

/* ---------------- Nouveau mot de passe (lien reçu par email) ---------------- */
function newpass(v) {
  v.innerHTML = shell(`
    <div class="ob-head"><h1 class="page-title">Nouveau mot de passe</h1></div>
    <form class="form" id="f" novalidate>
      <div class="stack"><label class="label" for="pw">Nouveau mot de passe</label><input id="pw" class="field" type="password" minlength="8" autocomplete="new-password" required></div>
      <button class="btn primary block" type="submit">Enregistrer</button>
    </form>`);
  v.querySelector('#f').addEventListener('submit', async e => {
    e.preventDefault();
    const pw = v.querySelector('#pw').value;
    if (pw.length < 8) return toast('8 caractères minimum');
    try { await updatePassword(pw); toast('Mot de passe modifié'); finish(); } catch (err) { toast(err.message, 4500); }
  });
}

/* ---------------- Créer ou rejoindre ---------------- */
function choice(v) {
  v.innerHTML = shell(`
    <div class="ob-head"><span class="kicker">Étape 2 sur 2</span><h1 class="page-title">Ton espace Duo</h1><p class="muted">Un espace privé pour deux personnes, pas plus.</p></div>
    <button class="card pad row ob-choice" data-act="create">
      <div class="tile-ic ic-violet">${icon('plus', 22)}</div>
      <div class="col grow"><span class="title-sm">Créer notre espace</span><span class="muted small">Tu recevras un code à envoyer à ton/ta partenaire</span></div>${icon('right', 18)}
    </button>
    <button class="card pad row ob-choice" data-act="join">
      <div class="tile-ic ic-pink">${icon('link', 22)}</div>
      <div class="col grow"><span class="title-sm">J'ai un code d'invitation</span><span class="muted small">Rejoindre l'espace créé par ton/ta partenaire</span></div>${icon('right', 18)}
    </button>`);
  v.querySelector('[data-act="join"]').addEventListener('click', () => go('join'));
  v.querySelector('[data-act="create"]').addEventListener('click', async e => {
    const btn = e.currentTarget;
    btn.disabled = true;
    try {
      ctx.coupleId = await createCouple('Notre Duo');
      await createInvitation();
      go('invite');
    } catch (err) { btn.disabled = false; toast(err.message, 4500); }
  });
}

/* ---------------- Rejoindre avec un code ---------------- */
function join(v) {
  v.innerHTML = shell(`
    <div class="ob-head"><h1 class="page-title">Entre le code</h1><p class="muted">Le code de 8 caractères reçu de ton/ta partenaire. Il est valable 24 h.</p></div>
    <form class="form" id="f" novalidate>
      <input id="code" class="field ob-code" maxlength="9" autocomplete="one-time-code" autocapitalize="characters" spellcheck="false" inputmode="text" placeholder="XXXX XXXX" aria-label="Code d'invitation">
      <button class="btn primary block" type="submit">Rejoindre</button>
    </form>`, 'choice');
  bindBack(v);
  const inp = v.querySelector('#code');
  inp.addEventListener('input', () => {
    const raw = inp.value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 8);
    inp.value = raw.length > 4 ? raw.slice(0, 4) + ' ' + raw.slice(4) : raw;
  });
  v.querySelector('#f').addEventListener('submit', async e => {
    e.preventDefault();
    const code = inp.value.replace(/\s/g, '');
    if (code.length !== 8) return toast('Le code fait 8 caractères');
    const btn = v.querySelector('button[type=submit]');
    busy(btn, true, 'Vérification…');
    try { await redeemInvitation(code); toast('Bienvenue dans votre espace Duo'); finish(); }
    catch (err) { busy(btn, false); toast(err.message, 4500); }
  });
}

/* ---------------- Invitation (affichage du code) ---------------- */
function invite(v) {
  const render = () => {
    const inv = storedInvitation();
    const left = inv ? Math.max(0, new Date(inv.expires_at) - Date.now()) : 0;
    const h = Math.floor(left / 36e5), m = Math.floor(left % 36e5 / 6e4);
    v.innerHTML = shell(`
      <div class="ob-head"><h1 class="page-title">Invite ton duo</h1><p class="muted">Envoie ce code à ton/ta partenaire. Il ne sert qu'une fois.</p></div>
      ${inv ? `
        <div class="card pad col" style="align-items:center;gap:12px">
          <div class="ob-code-show" aria-label="Code ${inv.code.split('').join(' ')}">${esc(inv.code.slice(0, 4))}<span></span>${esc(inv.code.slice(4))}</div>
          <span class="muted small">Expire dans ${h} h ${String(m).padStart(2, '0')}</span>
          <div class="row" style="gap:10px;width:100%">
            <button class="btn glass" style="flex:1" data-act="copy">${icon('copy', 17)}Copier</button>
            <button class="btn primary" style="flex:1" data-act="share">${icon('send', 17)}Envoyer</button>
          </div>
        </div>
        <div class="row muted small" style="justify-content:center;gap:8px"><span class="typing" style="height:auto;padding:0;background:none;border:0"><span></span><span></span><span></span></span>En attente de ton duo…</div>
        <button class="btn glass block" data-act="new">${icon('refresh', 17)}Générer un nouveau code</button>
      ` : `
        <div class="card pad col" style="gap:10px"><span class="title-sm">Aucun code actif sur cet appareil</span><span class="muted small">Le code n'est affiché qu'une fois, sur l'appareil qui l'a créé. Crée-en un nouveau.</span></div>
        <button class="btn primary block" data-act="new">${icon('plus', 17)}Créer un code</button>`}
      <button class="btn block" data-act="later" style="color:var(--muted)">Continuer sans attendre</button>`);
    v.querySelectorAll('[data-act]').forEach(b => b.addEventListener('click', () => act(b.dataset.act, inv, b)));
  };
  const act = async (a, inv, btn) => {
    if (a === 'copy') { try { await navigator.clipboard.writeText(inv.code); toast('Code copié'); } catch (e) { toast('Code : ' + inv.code); } }
    if (a === 'share') {
      const text = `Rejoins-moi sur Duo avec ce code : ${inv.code}\n${location.origin + location.pathname}`;
      if (navigator.share) { try { await navigator.share({ title: 'Duo', text }); } catch (e) { /* annulé */ } }
      else { try { await navigator.clipboard.writeText(text); toast('Invitation copiée'); } catch (e) { toast('Code : ' + inv.code); } }
    }
    if (a === 'new') {
      btn.disabled = true;
      try { if (inv) await revokeInvitation(); await createInvitation(); render(); toast('Nouveau code créé'); }
      catch (err) { btn.disabled = false; toast(err.message, 4500); }
    }
    if (a === 'later') finish();
  };
  render();
  ctx.timer = setInterval(render, 30000);
  if (ctx.coupleId) ctx.stopWatch = watchMembers(ctx.coupleId, () => { toast('Ton duo vient de rejoindre l’espace', 4000); finish(); });
}
