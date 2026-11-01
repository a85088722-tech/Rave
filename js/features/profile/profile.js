import { state, update, resetDemo } from '../../core/state.js';
import { readLegacyProfile, load, save } from '../../core/storage.js';
import { squareJpeg, pickImage } from '../../core/media.js';
import { openSheet } from '../../components/modal.js';
import { avatar } from '../../components/avatar.js';
import { icon } from '../../components/icons.js';
import { toast } from '../../components/toast.js';
import { esc } from '../../core/utils.js';
import { CONFIG } from '../../config.js';
import { updateMyProfile, uploadAvatar } from '../../services/profile.service.js';
import { signOut } from '../../services/auth.service.js';
import { createInvitation, storedInvitation } from '../../services/couple.service.js';
import { pushSupport, enablePush, disablePush, isPushEnabled } from '../../services/push.service.js';

async function changePhoto(camera, refresh) {
  const file = await pickImage({ camera });
  if (!file) return;
  try {
    toast('Envoi de la photo…');
    const blob = await squareJpeg(file, 320);
    const url = await uploadAvatar(blob);
    update('profile', s => { s.me.photo = url; });
    toast('Photo mise à jour');
    refresh();
  } catch (e) { toast(e.message, 4500); }
}

export function openProfile() {
  const legacy = readLegacyProfile();
  const imported = load('duo2.legacyImported', false);
  const missing = state.partner && state.partner.missing;
  const inv = storedInvitation();

  const close = openSheet({
    title: 'Mon profil',
    body: `
      <div class="row" style="gap:14px">
        <span id="pAv">${avatar(state.me, 64, { ring: 'violet' })}</span>
        <div class="col grow"><span style="font-size:18px;font-weight:800">${esc(state.me.name)}</span><span class="muted small">${missing ? 'En attente de ton duo' : 'Espace Duo avec ' + esc(state.partner.name)}</span></div>
      </div>
      <div class="row" style="gap:8px">
        <button class="btn glass" style="flex:1;height:44px;font-size:14px" data-act="cam">${icon('camera', 16)}Prendre</button>
        <button class="btn glass" style="flex:1;height:44px;font-size:14px" data-act="lib">${icon('image', 16)}Galerie</button>
      </div>
      <form class="form" id="profForm">
        <div class="stack"><label class="label" for="pName">Prénom</label><input id="pName" class="field" maxlength="24" value="${esc(state.me.name)}"></div>
        <div class="stack"><label class="label" for="pStatus">Statut</label><input id="pStatus" class="field" maxlength="60" placeholder="Ex : En mode film ce soir" value="${esc(state.me.status)}"></div>
        <button class="btn primary block" type="submit">${icon('check', 18)}Enregistrer</button>
      </form>
      ${missing ? `
      <div class="card pad col" style="gap:10px">
        <span class="kicker pink">Invitation</span>
        ${inv ? `<span class="small" style="color:var(--text-2)">Code actif : <b style="letter-spacing:2px;color:var(--text)">${esc(inv.code)}</b></span>` : '<span class="small" style="color:var(--text-2)">Crée un code de 8 caractères pour inviter ton duo.</span>'}
        <button class="btn glass block" data-act="invite">${icon(inv ? 'copy' : 'plus', 17)}${inv ? 'Copier le code' : 'Créer un code'}</button>
      </div>` : ''}
      ${legacy && !imported && !CONFIG.DEMO ? `
      <div class="card pad col" style="gap:8px">
        <span class="kicker">Profil Duo 1</span>
        <span class="small" style="color:var(--text-2);line-height:1.45">Profil trouvé sur cet appareil : <b>${esc(legacy.name)}</b>${legacy.photo ? ', avec photo' : ''}.</span>
        <button class="btn glass block" data-act="import">${icon('download', 17)}Importer la photo et le statut</button>
      </div>` : ''}
      <div class="card pad row" style="gap:12px">
        <div class="tile-ic ic-violet">${icon('bell', 20)}</div>
        <div class="col grow"><span class="title-sm">Notifications</span><span class="muted small" id="pushInfo">Nouveaux messages de ${esc(state.partner.name)}</span></div>
        <button class="btn glass" style="height:40px;font-size:13px" data-act="push" id="pushBtn">Activer</button>
      </div>
      ${CONFIG.DEMO ? `<button class="btn glass block" data-act="reset">${icon('refresh', 18)}Remettre les données d’exemple</button>` : ''}
      <button class="btn danger block" data-act="logout">${icon('logout', 18)}Se déconnecter</button>
      <span class="muted small" style="text-align:center">Duo ${CONFIG.APP_VERSION}</span>`,
    onMount(sheet, close) {
      isPushEnabled().then(on => { const b = sheet.querySelector('#pushBtn'); if (b && on) { b.textContent = 'Désactiver'; b.dataset.on = '1'; } }).catch(() => {});
      const refresh = () => { const el = sheet.querySelector('#pAv'); if (el) el.innerHTML = avatar(state.me, 64, { ring: 'violet' }); };
      sheet.querySelector('#profForm').addEventListener('submit', async e => {
        e.preventDefault();
        const name = sheet.querySelector('#pName').value.trim();
        const status = sheet.querySelector('#pStatus').value.trim();
        if (!name) { toast('Le prénom ne peut pas être vide'); return; }
        try {
          await updateMyProfile({ display_name: name, status });
          update('profile', s => { s.me.name = name; s.me.status = status; });
          toast('Profil enregistré');
          close();
        } catch (err) { toast(err.message, 4500); }
      });
      sheet.addEventListener('click', async e => {
        const b = e.target.closest('[data-act]');
        if (!b) return;
        const a = b.dataset.act;
        if (a === 'cam' || a === 'lib') changePhoto(a === 'cam', refresh);
        if (a === 'push') {
          b.disabled = true;
          try {
            if (b.dataset.on) { await disablePush(); b.textContent = 'Activer'; delete b.dataset.on; toast('Notifications désactivées'); }
            else {
              const sup = pushSupport();
              if (!sup.ok) { toast(sup.reason, 5000); b.disabled = false; return; }
              await enablePush(); b.textContent = 'Désactiver'; b.dataset.on = '1'; toast('Notifications activées');
            }
          } catch (err) { toast(err.message, 5000); }
          b.disabled = false;
        }
        if (a === 'reset') { resetDemo(); toast('Données d’exemple remises'); close(); }
        if (a === 'logout') {
          if (CONFIG.DEMO) { toast('Dans l’aperçu, la déconnexion ramène à l’accueil'); close(); location.hash = 'accueil'; return; }
          b.disabled = true; await signOut();
        }
        if (a === 'invite') {
          try {
            const code = (storedInvitation() || await createInvitation()).code;
            try { await navigator.clipboard.writeText(code); toast('Code ' + code + ' copié'); } catch (err) { toast('Code : ' + code, 5000); }
            close();
          } catch (err) { toast(err.message, 4500); }
        }
        if (a === 'import') {
          b.disabled = true;
          try {
            if (legacy.status) await updateMyProfile({ status: legacy.status });
            if (legacy.photo) { const url = await uploadAvatar(await squareJpeg(legacy.photo, 320)); update('profile', s => { s.me.photo = url; }); }
            update('profile', s => { if (legacy.status) s.me.status = legacy.status; });
            save('duo2.legacyImported', true);
            toast('Profil Duo 1 importé'); close();
          } catch (err) { b.disabled = false; toast(err.message, 4500); }
        }
      });
    }
  });
  return close;
}
