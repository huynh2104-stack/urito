import { Select } from '@/components/ui';
import { fromDateInput, toDateInput, type DateRange, type RangePreset } from '@/core/date';
import { useT } from '@/store/app';
import type { TranslationKey } from '@/i18n';

export const RANGE_PRESETS: { key: RangePreset; labelKey: TranslationKey }[] = [
  { key: 'today', labelKey: 'rep.rangeToday' },
  { key: 'yesterday', labelKey: 'rep.rangeYesterday' },
  { key: 'this_week', labelKey: 'rep.rangeThisWeek' },
  { key: 'last_week', labelKey: 'rep.rangeLastWeek' },
  { key: 'this_month', labelKey: 'rep.rangeThisMonth' },
  { key: 'last_month', labelKey: 'rep.rangeLastMonth' },
  { key: 'last_7', labelKey: 'rep.rangeLast7' },
  { key: 'last_30', labelKey: 'rep.rangeLast30' },
  { key: 'this_year', labelKey: 'rep.rangeThisYear' },
  { key: 'custom', labelKey: 'rep.rangeCustom' },
];

export function RangePicker({
  preset,
  onPreset,
  range,
  onRange,
  presets = RANGE_PRESETS,
}: {
  preset: RangePreset;
  onPreset: (p: RangePreset) => void;
  range: DateRange;
  onRange: (r: DateRange) => void;
  presets?: { key: RangePreset; labelKey: TranslationKey }[];
}) {
  const t = useT();
  return (
    <div className="row gap-8 wrap">
      <Select
        value={preset}
        onChange={(e) => onPreset(e.target.value as RangePreset)}
        style={{ width: 165 }}
      >
        {presets.map((p) => (
          <option key={p.key} value={p.key}>
            {t(p.labelKey)}
          </option>
        ))}
      </Select>
      {preset === 'custom' && (
        <>
          <input
            className="input"
            type="date"
            style={{ width: 155 }}
            value={toDateInput(range.from)}
            onChange={(e) => onRange({ ...range, from: fromDateInput(e.target.value) })}
          />
          <input
            className="input"
            type="date"
            style={{ width: 155 }}
            value={toDateInput(range.to)}
            onChange={(e) => onRange({ ...range, to: fromDateInput(e.target.value, true) })}
          />
        </>
      )}
    </div>
  );
}
