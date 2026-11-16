/** ロゴ等向けに最大辺へリサイズした DataURL を返す。 */
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
    // 透過PNGの背景が黒くなるのを防ぐため白で塗る
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
  }
  ctx?.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  return canvas.toDataURL(type, quality);
}

/** 正方形中央トリミングの DataURL を返す（後方互換用）。 */
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

export interface EncodedThumb {
  mime: string;
  bytes: ArrayBuffer;
  w: number;
  h: number;
}

/** C-01: 商品画像を正方形(320x320)へ切り抜き、WebP（非対応環境ではJPEG）の ArrayBuffer として圧縮する。 */
export async function encodeProductThumb(file: File, size = 320): Promise<EncodedThumb> {
  const bitmap = await createImageBitmap(file);
  const side = Math.min(bitmap.width, bitmap.height);
  const sx = Math.floor((bitmap.width - side) / 2);
  const sy = Math.floor((bitmap.height - side) / 2);

  try {
    if (typeof OffscreenCanvas !== 'undefined') {
      const off = new OffscreenCanvas(size, size);
      const ctx = off.getContext('2d');
      if (ctx) {
        ctx.fillStyle = '#fff';
        ctx.fillRect(0, 0, size, size);
        ctx.drawImage(bitmap, sx, sy, side, side, 0, 0, size, size);
      }
      let blob = await off.convertToBlob({ type: 'image/webp', quality: 0.8 });
      if (blob.type !== 'image/webp') {
        blob = await off.convertToBlob({ type: 'image/jpeg', quality: 0.8 });
      }
      return { mime: blob.type || 'image/webp', bytes: await blob.arrayBuffer(), w: size, h: size };
    }

    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d');
    if (ctx) {
      ctx.fillStyle = '#fff';
      ctx.fillRect(0, 0, size, size);
      ctx.drawImage(bitmap, sx, sy, side, side, 0, 0, size, size);
    }
    const blob = await new Promise<Blob>((resolve, reject) => {
      canvas.toBlob(
        (b) => (b ? resolve(b) : reject(new Error('toBlob failed'))),
        'image/webp',
        0.8,
      );
    });
    return { mime: blob.type || 'image/jpeg', bytes: await blob.arrayBuffer(), w: size, h: size };
  } finally {
    bitmap.close();
  }
}

/** base64 DataURL を ArrayBuffer へ復号する（マイグレーション用・Canvas不要）。 */
export function dataUrlToImageBytes(dataUrl: string, size = 320): EncodedThumb | null {
  const m = dataUrl.match(/^data:([^;]+);base64,(.+)$/);
  if (!m) return null;
  const bin = atob(m[2]);
  const bytes = new ArrayBuffer(bin.length);
  const view = new Uint8Array(bytes);
  for (let i = 0; i < bin.length; i++) view[i] = bin.charCodeAt(i);
  return { mime: m[1] || 'image/jpeg', bytes, w: size, h: size };
}
