/** Downscale a photo before it goes into IndexedDB. A 4 MB phone photo becomes
 *  a ~15 KB JPEG, so a shop with 2,000 products still fits comfortably and the
 *  POS grid stays fast on a weak machine. */
export async function shrinkImage(
  file: File,
  maxSize: number,
  type: 'image/jpeg' | 'image/png' = 'image/jpeg',
  quality = 0.82,
): Promise<string> {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, maxSize / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(bitmap.width * scale));
  canvas.height = Math.max(1, Math.round(bitmap.height * scale));
  const ctx = canvas.getContext('2d');
  if (ctx && type === 'image/jpeg') {
    // JPEG has no alpha: paint white so transparent PNG logos do not turn black.
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
  }
  ctx?.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  return canvas.toDataURL(type, quality);
}

/** Square centre crop, used for product tiles so every photo lines up. */
export async function squareThumb(file: File, size = 320): Promise<string> {
  const bitmap = await createImageBitmap(file);
  const side = Math.min(bitmap.width, bitmap.height);
  const sx = (bitmap.width - side) / 2;
  const sy = (bitmap.height - side) / 2;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  if (ctx) {
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, size, size);
    ctx.drawImage(bitmap, sx, sy, side, side, 0, 0, size, size);
  }
  bitmap.close();
  return canvas.toDataURL('image/jpeg', 0.8);
}
