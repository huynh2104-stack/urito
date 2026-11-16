import { useId } from 'react';

/** Urito のロゴマーク（コバルト色タイルに「U」とレシート合計用の黄色ハイライト線・インラインSVG）。 */
export function Logo({ size = 34, className = '' }: { size?: number; className?: string }) {
  const gid = useId().replace(/:/g, '');
  return (
    <svg
      className={className}
      width={size}
      height={size}
      viewBox="0 0 64 64"
      role="img"
      aria-label="Urito"
      style={{ flex: 'none', display: 'block' }}
    >
      <defs>
        <linearGradient id={gid} x1="0" y1="0" x2="0.35" y2="1">
          <stop offset="0" stopColor="#5b7bff" />
          <stop offset="1" stopColor="#2038b8" />
        </linearGradient>
      </defs>
      <rect width="64" height="64" rx="16" fill={`url(#${gid})`} />
      <path
        d="M19 15v20c0 7.5 5.7 12.5 13 12.5S45 42.5 45 35V15"
        fill="none"
        stroke="#fff"
        strokeWidth="6.5"
        strokeLinecap="round"
      />
      <rect x="21" y="50" width="22" height="4.5" rx="2.25" fill="#ffce3a" />
    </svg>
  );
}
