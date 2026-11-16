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

/** 画像ファイルをフルデコードせずにヘッダから幅・高さを読み取る（EXIF Orientation 5..8 の縦横入替も考慮）。 */
export async function readImageDimensions(blob: Blob): Promise<{ w: number; h: number } | null> {
  const head = new DataView(await blob.slice(0, 65536).arrayBuffer());
  const len = head.byteLength;
  if (len < 12) return null;

  // PNG: 89 50 4E 47 0D 0A 1A 0A + IHDR
  if (len >= 24 && head.getUint32(0) === 0x89504e47 && head.getUint32(4) === 0x0d0a1a0a) {
    return { w: head.getUint32(16), h: head.getUint32(20) };
  }

  // WebP: RIFF....WEBP
  if (len >= 30 && head.getUint32(0) === 0x52494646 && head.getUint32(8) === 0x57454250) {
    const chunk = head.getUint32(12);
    if (chunk === 0x56503858 && len >= 30) {
      const w = 1 + (head.getUint8(24) | (head.getUint8(25) << 8) | (head.getUint8(26) << 16));
      const h = 1 + (head.getUint8(27) | (head.getUint8(28) << 8) | (head.getUint8(29) << 16));
      return { w, h };
    }
    if (chunk === 0x5650384c && len >= 25 && head.getUint8(20) === 0x2f) {
      const b = head.getUint32(21, true);
      return { w: (b & 0x3fff) + 1, h: ((b >> 14) & 0x3fff) + 1 };
    }
    if (
      chunk === 0x56503820 &&
      len >= 30 &&
      head.getUint8(23) === 0x9d &&
      head.getUint8(24) === 0x01 &&
      head.getUint8(25) === 0x2a
    ) {
      return { w: head.getUint16(26, true) & 0x3fff, h: head.getUint16(28, true) & 0x3fff };
    }
  }

  // JPEG: SOI (FF D8) -> EXIF Orientation + SOFn
  if (head.getUint16(0) === 0xffd8) {
    let pos = 2;
    let rotated = false;
    while (pos + 4 <= len) {
      if (head.getUint8(pos) !== 0xff) break;
      const marker = head.getUint8(pos + 1);
      if (marker === 0xd9 || marker === 0xda) break;
      if (marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) {
        pos += 2;
        continue;
      }
      const segLen = head.getUint16(pos + 2);
      if (segLen < 2 || pos + 2 + segLen > len) break;
      if (marker === 0xe1 && segLen >= 16 && head.getUint32(pos + 4) === 0x45786966) {
        const tiff = pos + 10;
        const le = head.getUint16(tiff) === 0x4949;
        const dirStart = tiff + head.getUint32(tiff + 4, le);
        if (dirStart + 2 <= pos + 2 + segLen) {
          const entries = head.getUint16(dirStart, le);
          for (let i = 0; i < entries; i++) {
            const e = dirStart + 2 + i * 12;
            if (e + 12 > pos + 2 + segLen) break;
            if (head.getUint16(e, le) === 0x0112) {
              const orient = head.getUint16(e + 8, le);
              if (orient >= 5 && orient <= 8) rotated = true;
              break;
            }
          }
        }
      }
      const isSof =
        (marker >= 0xc0 && marker <= 0xc3) ||
        (marker >= 0xc5 && marker <= 0xc7) ||
        (marker >= 0xc9 && marker <= 0xcb) ||
        (marker >= 0xcd && marker <= 0xcf);
      if (isSof && pos + 9 < len) {
        const h = head.getUint16(pos + 5);
        const w = head.getUint16(pos + 7);
        return rotated ? { w: h, h: w } : { w, h };
      }
      pos += 2 + segLen;
    }
  }
  return null;
}

async function decodeScaledBitmap(file: Blob, targetShortSide: number): Promise<ImageBitmap> {
  try {
    const dims = await readImageDimensions(file);
    if (dims && dims.w > 0 && dims.h > 0 && Math.min(dims.w, dims.h) > targetShortSide) {
      const opts: ImageBitmapOptions =
        dims.w <= dims.h
          ? { resizeWidth: targetShortSide, resizeQuality: 'high' }
          : { resizeHeight: targetShortSide, resizeQuality: 'high' };
      return await createImageBitmap(file, opts);
    }
  } catch {
    /* リサイズデコード非対応環境では通常デコードへフォールバックする */
  }
  return createImageBitmap(file);
}

/** C-01: デコード時リサイズと正方形トリミングで高解像度画像のメモリ展開を抑え、WebP バイナリを返す。 */
export async function encodeProductThumb(file: File, size = 320): Promise<EncodedThumb> {
  const bitmap = await decodeScaledBitmap(file, size);
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
  const bytes = base64ToArrayBuffer(m[2]);
  return { mime: m[1] || 'image/jpeg', bytes, w: size, h: size };
}

export function mimeToExt(mime: string): string {
  if (mime.includes('webp')) return 'webp';
  if (mime.includes('png')) return 'png';
  return 'jpg';
}

export function arrayBufferToBase64(buf: ArrayBuffer): string {
  const u8 = new Uint8Array(buf);
  let bin = '';
  for (let i = 0; i < u8.length; i += 8192) {
    bin += String.fromCharCode(...u8.subarray(i, i + 8192));
  }
  return btoa(bin);
}

export function base64ToArrayBuffer(b64: string): ArrayBuffer {
  const bin = atob(b64);
  const bytes = new ArrayBuffer(bin.length);
  const view = new Uint8Array(bytes);
  for (let i = 0; i < bin.length; i++) view[i] = bin.charCodeAt(i);
  return bytes;
}
