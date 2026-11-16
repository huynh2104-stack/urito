import type { Lang } from '@/db/types';
import { localeTag } from './money';

export type RangePreset =
  | 'today'
  | 'yesterday'
  | 'this_week'
  | 'last_week'
  | 'this_month'
  | 'last_month'
  | 'last_7'
  | 'last_30'
  | 'this_year'
  | 'custom';

export interface DateRange {
  from: number;
  to: number;
}

export const DAY = 86_400_000;

export function startOfDay(ts: number | Date): number {
  const d = new Date(ts);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

export function endOfDay(ts: number | Date): number {
  const d = new Date(ts);
  d.setHours(23, 59, 59, 999);
  return d.getTime();
}

/** 週の起点を返す（標準は月曜始まり、設定で日曜始まりにも切替可）。 */
export function startOfWeek(ts: number | Date, weekStartsOn: 0 | 1 = 1): number {
  const d = new Date(startOfDay(ts));
  const diff = (d.getDay() - weekStartsOn + 7) % 7;
  d.setDate(d.getDate() - diff);
  return d.getTime();
}

export function startOfMonth(ts: number | Date): number {
  const d = new Date(ts);
  return new Date(d.getFullYear(), d.getMonth(), 1, 0, 0, 0, 0).getTime();
}

export function endOfMonth(ts: number | Date): number {
  const d = new Date(ts);
  return new Date(d.getFullYear(), d.getMonth() + 1, 0, 23, 59, 59, 999).getTime();
}

export function startOfYear(ts: number | Date): number {
  return new Date(new Date(ts).getFullYear(), 0, 1).getTime();
}

export function rangeOf(preset: RangePreset, now = Date.now(), weekStartsOn: 0 | 1 = 1): DateRange {
  switch (preset) {
    case 'today':
      return { from: startOfDay(now), to: endOfDay(now) };
    case 'yesterday':
      return { from: startOfDay(now - DAY), to: endOfDay(now - DAY) };
    case 'this_week':
      return { from: startOfWeek(now, weekStartsOn), to: endOfDay(now) };
    case 'last_week': {
      const start = startOfWeek(now, weekStartsOn) - 7 * DAY;
      return { from: start, to: endOfDay(start + 6 * DAY) };
    }
    case 'this_month':
      return { from: startOfMonth(now), to: endOfDay(now) };
    case 'last_month': {
      const d = new Date(now);
      const prev = new Date(d.getFullYear(), d.getMonth() - 1, 1);
      return { from: startOfMonth(prev), to: endOfMonth(prev) };
    }
    case 'last_7':
      return { from: startOfDay(now - 6 * DAY), to: endOfDay(now) };
    case 'last_30':
      return { from: startOfDay(now - 29 * DAY), to: endOfDay(now) };
    case 'this_year':
      return { from: startOfYear(now), to: endOfDay(now) };
    default:
      return { from: startOfDay(now), to: endOfDay(now) };
  }
}

/** 前期間比の比較用に、指定期間と同じ長さの直前期間を返す。 */
export function previousRange(range: DateRange): DateRange {
  const span = range.to - range.from;
  return { from: range.from - span - 1, to: range.from - 1 };
}

export function dayKey(ts: number): string {
  const d = new Date(ts);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export function monthKey(ts: number): string {
  const d = new Date(ts);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

export function toDateInput(ts: number): string {
  return dayKey(ts);
}

export function fromDateInput(value: string, end = false): number {
  const [y, m, d] = value.split('-').map(Number);
  if (!y || !m || !d) return Date.now();
  return end
    ? new Date(y, m - 1, d, 23, 59, 59, 999).getTime()
    : new Date(y, m - 1, d, 0, 0, 0, 0).getTime();
}

export function formatDate(ts: number, lang: Lang): string {
  return new Intl.DateTimeFormat(localeTag(lang), {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(ts);
}

export function formatTime(ts: number, lang: Lang): string {
  return new Intl.DateTimeFormat(localeTag(lang), {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(ts);
}

export function formatDateTime(ts: number, lang: Lang): string {
  return `${formatDate(ts, lang)} ${formatTime(ts, lang)}`;
}

export function formatDuration(ms: number, lang: Lang): string {
  const mins = Math.max(0, Math.floor(ms / 60000));
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  const unit = lang === 'ja' ? { h: '時間', m: '分' } : lang === 'vi' ? { h: 'g', m: 'p' } : { h: 'h', m: 'm' };
  return h > 0 ? `${h}${unit.h}${m}${unit.m}` : `${m}${unit.m}`;
}

/** Every day between two timestamps, used to draw gap-free charts. */
export function eachDay(from: number, to: number): number[] {
  const out: number[] = [];
  let cursor = startOfDay(from);
  const limit = endOfDay(to);
  let guard = 0;
  while (cursor <= limit && guard++ < 800) {
    out.push(cursor);
    const next = new Date(cursor);
    next.setDate(next.getDate() + 1);
    cursor = next.getTime();
  }
  return out;
}
