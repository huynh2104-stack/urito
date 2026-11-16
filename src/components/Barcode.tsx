import { code128Bars } from '@/lib/barcode';

/** 鮮明な SVG バーコード表示。あらゆるラベル寸法に拡縮でき、サーマルプリンタでも鮮明に印字される。 */
export function Barcode({
  value,
  height = 40,
  showText = true,
  className,
}: {
  value: string;
  height?: number;
  showText?: boolean;
  className?: string;
}) {
  if (!value) return null;
  const { bars, width } = code128Bars(value);
  const quiet = 10;
  const total = width + quiet * 2;
  const textH = showText ? 12 : 0;
  return (
    <svg
      className={className}
      viewBox={`0 0 ${total} ${height + textH}`}
      preserveAspectRatio="none"
      style={{ width: '100%', height: 'auto', display: 'block' }}
      role="img"
      aria-label={value}
    >
      <rect x="0" y="0" width={total} height={height + textH} fill="#fff" />
      {bars.map(([x, w], i) => (
        <rect key={i} x={x + quiet} y="0" width={w} height={height} fill="#000" />
      ))}
      {showText && (
        <text
          x={total / 2}
          y={height + textH - 1}
          textAnchor="middle"
          fontSize="11"
          fontFamily="Consolas, monospace"
          fill="#000"
        >
          {value}
        </text>
      )}
    </svg>
  );
}
