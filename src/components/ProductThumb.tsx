import type { CSSProperties } from 'react';
import { useThumb } from '@/lib/thumbCache';

/** サムネイル未設定商品向けの2文字モノグラムを生成する。 */
export function monogram(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean);
  const letters = words.length > 1 ? words[0][0] + words[1][0] : (words[0] ?? '?').slice(0, 2);
  return letters.toUpperCase();
}

/** Soft tinted placeholder: the category colour at low opacity with the
 *  initials in the full colour - readable, and calmer than a solid block. */
export function tint(color: string | undefined): CSSProperties {
  const c = color && /^#[0-9a-f]{6}$/i.test(color) ? color : '#2947d4';
  return { background: `${c}1f`, color: c };
}

/** Product picture, or a tinted monogram when the shop has no photo. */
export function ProductThumb({
  productId,
  imageRev,
  name,
  color,
  image,
  size = 40,
  className = '',
}: {
  productId?: string;
  imageRev?: number;
  name: string;
  color?: string;
  image?: string;
  size?: number;
  className?: string;
}) {
  const { ref, src } = useThumb(productId, imageRev, image);
  return (
    <span
      ref={ref}
      className={`pthumb ${className}`}
      style={{ width: size, height: size, fontSize: Math.max(11, Math.round(size * 0.34)), ...(src ? undefined : tint(color)) }}
    >
      {src ? <img src={src} alt="" loading="lazy" decoding="async" /> : monogram(name)}
    </span>
  );
}
