/** Recadre une image en carré et la compresse en JPEG. Renvoie un Blob. */
export function squareJpeg(source, size = 320, quality = 0.85) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const isBlob = source instanceof Blob;
    const url = isBlob ? URL.createObjectURL(source) : source;
    img.onload = () => {
      const s = Math.min(img.naturalWidth, img.naturalHeight);
      const c = document.createElement('canvas');
      c.width = c.height = size;
      c.getContext('2d').drawImage(img, (img.naturalWidth - s) / 2, (img.naturalHeight - s) / 2, s, s, 0, 0, size, size);
      if (isBlob) URL.revokeObjectURL(url);
      c.toBlob(b => (b ? resolve(b) : reject(new Error('Image illisible'))), 'image/jpeg', quality);
    };
    img.onerror = () => { if (isBlob) URL.revokeObjectURL(url); reject(new Error('Image illisible')); };
    img.src = url;
  });
}

/** Ouvre le sélecteur de photo du téléphone et renvoie le fichier choisi (ou null). */
export function pickImage({ camera = false } = {}) {
  return new Promise(resolve => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/*';
    if (camera) input.setAttribute('capture', 'user');
    input.style.display = 'none';
    input.addEventListener('change', () => { resolve(input.files && input.files[0] ? input.files[0] : null); input.remove(); });
    document.body.appendChild(input);
    input.click();
  });
}
