import { useId, useMemo, useState } from 'react';
import type { SeriesPoint } from '@/services/reports';

/* Hand-rolled SVG charts: no charting library, no extra 200 KB to download,
 * and they inherit the theme tokens so dark mode needs no extra work. */

export function BarChart({
  data,
  height = 190,
  format,
  color = 'var(--c-brand)',
}: {
  data: SeriesPoint[];
  height?: number;
  format: (v: number) => string;
  color?: string;
}) {
  const [hover, setHover] = useState<number | null>(null);
  const max = useMemo(() => Math.max(1, ...data.map((d) => d.value)), [data]);
  const padTop = 18;
  const padBottom = 22;
  const plot = height - padTop - padBottom;
  const step = 100 / Math.max(1, data.length);
  const barW = Math.min(step * 0.56, 8);
  const gid = useId().replace(/:/g, '');

  return (
    <div style={{ position: 'relative' }}>
      <svg className="chart" viewBox={`0 0 100 ${height}`} preserveAspectRatio="none" style={{ height }}>
        <defs>
          <linearGradient id={gid} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#5b7bff" />
            <stop offset="1" stopColor="#2947d4" />
          </linearGradient>
        </defs>
        {[0, 0.5, 1].map((f) => (
          <line
            key={f}
            className="chart-grid-line"
            x1="0"
            x2="100"
            y1={padTop + plot * f}
            y2={padTop + plot * f}
            vectorEffect="non-scaling-stroke"
          />
        ))}
        {data.map((d, i) => {
          const h = (d.value / max) * plot;
          const x = step * i + step / 2 - barW / 2;
          return (
            <rect
              key={d.key}
              className="chart-bar"
              x={x}
              y={padTop + plot - h}
              width={barW}
              height={Math.max(h, d.value > 0 ? 1.5 : 0)}
              rx="1.6"
              fill={hover === i ? 'var(--c-brand-hover)' : color === 'var(--c-brand)' ? `url(#${gid})` : color}
              opacity={hover === null || hover === i ? 1 : 0.5}
              onMouseEnter={() => setHover(i)}
              onMouseLeave={() => setHover(null)}
            />
          );
        })}
      </svg>
      <div className="row between tiny dim" style={{ marginTop: -14 }}>
        {data.map((d, i) => (
          <span
            key={d.key}
            style={{
              flex: 1,
              textAlign: 'center',
              fontWeight: hover === i ? 700 : 400,
              color: hover === i ? 'var(--c-text)' : undefined,
            }}
          >
            {data.length > 16 && i % 2 ? '' : d.label}
          </span>
        ))}
      </div>
      <div className="small strong center" style={{ minHeight: 20, marginTop: 4 }}>
        {hover !== null ? `${data[hover].label} — ${format(data[hover].value)}` : ''}
      </div>
    </div>
  );
}

export interface HBarRow {
  key: string;
  label: string;
  value: number;
  meta?: string;
  color?: string;
}

export function HBarList({
  rows,
  format,
  emptyLabel,
}: {
  rows: HBarRow[];
  format: (v: number) => string;
  emptyLabel: string;
}) {
  const max = Math.max(1, ...rows.map((r) => r.value));
  if (!rows.length) return <div className="empty small">{emptyLabel}</div>;
  return (
    <div className="col gap-12">
      {rows.map((r) => (
        <div key={r.key}>
          <div className="row between small" style={{ marginBottom: 4 }}>
            <span className="truncate" style={{ maxWidth: '62%' }}>
              {r.label}
            </span>
            <span className="num strong">
              {format(r.value)}
              {r.meta ? <span className="dim" style={{ fontWeight: 400 }}> · {r.meta}</span> : null}
            </span>
          </div>
          <div className="bar-track">
            <div
              className="bar-fill"
              style={{ width: `${(r.value / max) * 100}%`, background: r.color ?? 'var(--c-brand)' }}
            />
          </div>
        </div>
      ))}
    </div>
  );
}

export function DonutChart({
  slices,
  size = 148,
  centerLabel,
  centerValue,
}: {
  slices: { key: string; label: string; value: number; color: string }[];
  size?: number;
  centerLabel?: string;
  centerValue?: string;
}) {
  const total = slices.reduce((s, x) => s + x.value, 0);
  const radius = 60;
  const circumference = 2 * Math.PI * radius;
  let offset = 0;

  return (
    <div className="row gap-16 wrap">
      <svg width={size} height={size} viewBox="0 0 160 160" style={{ flex: 'none' }}>
        <g transform="translate(80,80) rotate(-90)">
          <circle r={radius} fill="none" stroke="var(--c-surface-3)" strokeWidth="22" />
          {total > 0 &&
            slices.map((s) => {
              const len = (s.value / total) * circumference;
              const el = (
                <circle
                  key={s.key}
                  r={radius}
                  fill="none"
                  stroke={s.color}
                  strokeWidth="22"
                  strokeDasharray={`${len} ${circumference - len}`}
                  strokeDashoffset={-offset}
                />
              );
              offset += len;
              return el;
            })}
        </g>
        {centerValue && (
          <>
            <text x="80" y="76" textAnchor="middle" fontSize="15" fontWeight="700" fill="var(--c-text)">
              {centerValue}
            </text>
            <text x="80" y="94" textAnchor="middle" fontSize="10" fill="var(--c-text-3)">
              {centerLabel}
            </text>
          </>
        )}
      </svg>
      <div className="col gap-4 grow">
        {slices.map((s) => (
          <div key={s.key} className="row between small">
            <span className="row gap-4">
              <span className="color-dot" style={{ background: s.color }} />
              {s.label}
            </span>
            <span className="num muted">{total ? ((s.value / total) * 100).toFixed(0) : 0}%</span>
          </div>
        ))}
      </div>
    </div>
  );
}

export function Sparkline({ values, height = 34 }: { values: number[]; height?: number }) {
  if (values.length < 2) return null;
  const max = Math.max(...values, 1);
  const min = Math.min(...values, 0);
  const span = max - min || 1;
  const pts = values
    .map((v, i) => `${(i / (values.length - 1)) * 100},${height - ((v - min) / span) * height}`)
    .join(' ');
  return (
    <svg viewBox={`0 0 100 ${height}`} preserveAspectRatio="none" style={{ width: '100%', height }}>
      <polyline
        points={pts}
        fill="none"
        stroke="var(--c-brand)"
        strokeWidth="2"
        vectorEffect="non-scaling-stroke"
        strokeLinejoin="round"
      />
    </svg>
  );
}
