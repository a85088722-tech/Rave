let timer = null;

export function toast(message, ms = 2600) {
  const el = document.getElementById('toast');
  if (!el) return;
  el.textContent = message;
  el.classList.add('show');
  clearTimeout(timer);
  timer = setTimeout(() => el.classList.remove('show'), ms);
}

/** Message standard pour une fonction prévue dans une phase suivante. */
export function soon(feature, phase) {
  toast(`${feature} : arrive en phase ${phase}`);
}
