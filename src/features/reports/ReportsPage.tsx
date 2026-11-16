import { useMemo, useState } from 'react';
import { Button, EmptyState, Stat, Tabs } from '@/components/ui';
import { BarChart, DonutChart, HBarList } from '@/components/charts';
import { db } from '@/db/db';
import { useLiveQuery } from '@/lib/useLiveQuery';
import { dayKey, previousRange, rangeOf, type RangePreset } from '@/core/date';
import { formatAmount, formatNumber } from '@/core/money';
import { PALETTE } from '@/db/defaults';
import { useApp, useMoney, useT } from '@/store/app';
import { downloadCsv, timestampedName } from '@/services/csv';
import { growth } from '@/services/reports';
import { ensureRollupsBuilt } from '@/services/rollups';
import {
  categoryStatsFromProductStats,
  employeeStatsFromRollups,
  orderTypeStatsFromRollups,
  paymentStatsFromRollups,
  productStatsFromRollups,
  revenueByDayFromRollups,
  revenueByHourFromRollups,
  summariseRollups,
  taxLinesFromRollups,
} from '@/services/rollupQueries';
import { RANGE_PRESETS, RangePicker } from './RangePicker';
import type { DailyProductStatsRow, DailyStatsRow, Expense } from '@/db/types';
import type { TranslationKey } from '@/i18n';

type TabKey = 'overview' | 'products' | 'time' | 'people';

const PAY_LABEL: Record<string, TranslationKey> = {
  cash: 'pay.cash',
  card: 'pay.card',
  transfer: 'pay.transfer',
  ewallet: 'pay.ewallet',
  qr: 'pay.qr',
  debt: 'pay.debt',
  points: 'pay.points',
};

const TYPE_LABEL: Record<string, TranslationKey> = {
  retail: 'pos.retail',
  dine_in: 'pos.dineIn',
  takeaway: 'pos.takeaway',
  delivery: 'pos.delivery',
};

export function ReportsPage() {
  const t = useT();
  const money = useMoney();
  const settings = useApp((s) => s.settings);

  const weekStartsOn = settings.weekStartsOn ?? (settings.lang === 'ja' ? 0 : 1);
  const [preset, setPreset] = useState<RangePreset>('this_month');
  const [custom, setCustom] = useState(() => rangeOf('this_month', Date.now(), weekStartsOn));
  const [tab, setTab] = useState<TabKey>('overview');

  const [now] = useState(() => Date.now());
  const range = useMemo(
    () => (preset === 'custom' ? custom : rangeOf(preset, now, weekStartsOn)),
    [preset, custom, now, weekStartsOn],
  );
  const prev = useMemo(() => previousRange(range), [range]);

  const fromDay = dayKey(range.from);
  const toDay = dayKey(range.to);
  const prevFromDay = dayKey(prev.from);
  const prevToDay = dayKey(prev.to);

  const dayRows = useLiveQuery(
    async () => {
      await ensureRollupsBuilt();
      return db.dailyStats.where('day').between(fromDay, toDay, true, true).toArray();
    },
    [fromDay, toDay],
    [] as DailyStatsRow[],
  );
  const prodRows = useLiveQuery(
    async () => {
      await ensureRollupsBuilt();
      return db.dailyProductStats.where('day').between(fromDay, toDay, true, true).toArray();
    },
    [fromDay, toDay],
    [] as DailyProductStatsRow[],
  );
  const prevDayRows = useLiveQuery(
    async () => {
      await ensureRollupsBuilt();
      return db.dailyStats.where('day').between(prevFromDay, prevToDay, true, true).toArray();
    },
    [prevFromDay, prevToDay],
    [] as DailyStatsRow[],
  );
  const expenses = useLiveQuery(
    async () => db.expenses.where('at').between(range.from, range.to, true, true).toArray(),
    [range.from, range.to],
    [] as Expense[],
  );
  const products = useLiveQuery(async () => db.products.toArray(), [], []);
  const categories = useLiveQuery(async () => db.categories.toArray(), [], []);

  const summary = useMemo(() => summariseRollups(dayRows, expenses), [dayRows, expenses]);
  const taxLines = useMemo(() => taxLinesFromRollups(dayRows), [dayRows]);
  const prevSummary = useMemo(() => summariseRollups(prevDayRows), [prevDayRows]);
  const byDay = useMemo(
    () => revenueByDayFromRollups(dayRows, range.from, range.to, settings.lang),
    [dayRows, range.from, range.to, settings.lang],
  );
  const byHour = useMemo(() => revenueByHourFromRollups(dayRows), [dayRows]);
  const top = useMemo(() => productStatsFromRollups(prodRows), [prodRows]);
  const catNames = useMemo(() => new Map(categories.map((c) => [c.id, c.name])), [categories]);
  const byCategory = useMemo(() => categoryStatsFromProductStats(top, products), [top, products]);
  const byPayment = useMemo(() => paymentStatsFromRollups(dayRows), [dayRows]);
  const byEmployee = useMemo(() => employeeStatsFromRollups(dayRows), [dayRows]);
  const byType = useMemo(() => orderTypeStatsFromRollups(dayRows), [dayRows]);
  const hasData = summary.orderCount > 0 || summary.voidCount > 0 || summary.refunds > 0;

  const peak = byHour.reduce((best, cur) => (cur.value > best.value ? cur : best), byHour[0]);

  const exportCsv = () => {
    const plain = (v: number) => formatAmount(v, settings.currency, 'en');
    const rows: (string | number)[][] = [
      [t('rep.title'), `${new Date(range.from).toLocaleDateString()} - ${new Date(range.to).toLocaleDateString()}`],
      [],
      [t('rep.revenue'), plain(summary.revenue)],
      [t('rep.refunds'), plain(summary.refunds)],
      [t('rep.netRevenue'), plain(summary.netRevenue)],
      [t('rep.cogs'), plain(summary.cogs)],
      [t('rep.grossProfit'), plain(summary.grossProfit)],
      [t('rep.expenses'), plain(summary.expenses)],
      [t('rep.netProfit'), plain(summary.netProfit)],
      [t('rep.orderCount'), summary.orderCount],
      [t('rep.avgOrder'), plain(summary.avgOrder)],
      [],
      [t('rep.topProducts')],
      [t('common.name'), t('rep.quantitySold'), t('rep.revenue'), t('common.profit')],
      ...top.map((p) => [p.name, p.qty, plain(p.revenue), plain(p.profit)]),
      [],
      [t('rep.byDay')],
      [t('common.date'), t('rep.revenue'), t('rep.grossProfit')],
      ...byDay.map((d) => [d.key, plain(d.value), plain(d.secondary ?? 0)]),
    ];
    downloadCsv(timestampedName('urito-report'), rows);
  };

  const tabs: { key: TabKey; label: string }[] = [
    { key: 'overview', label: t('rep.overview') },
    { key: 'products', label: t('rep.topProducts') },
    { key: 'time', label: t('rep.byHour') },
    { key: 'people', label: t('rep.byEmployee') },
  ];

  return (
    <div className="page page-wide">
      <div className="page-head">
        <div>
          <div className="page-title">{t('rep.title')}</div>
          <div className="page-sub">{t('rep.profitFormula')}</div>
        </div>
        <div className="row gap-8">
          <RangePicker preset={preset} onPreset={setPreset} range={custom} onRange={setCustom} presets={RANGE_PRESETS} />
          <Button icon="download" onClick={exportCsv} disabled={!hasData}>
            {t('rep.exportCsv')}
          </Button>
        </div>
      </div>

      <div className="grid grid-4 mb-16">
        <Stat
          label={t('rep.netRevenue')}
          value={money(summary.netRevenue)}
          delta={growth(summary.netRevenue, prevSummary.netRevenue)}
          hint={t('rep.vsPrevious')}
        />
        <Stat
          label={t('rep.orderCount')}
          value={formatNumber(summary.orderCount, settings.lang)}
          delta={growth(summary.orderCount, prevSummary.orderCount)}
          hint={t('rep.vsPrevious')}
        />
        <Stat
          label={t('rep.grossProfit')}
          value={money(summary.grossProfit)}
          tone={summary.grossProfit >= 0 ? 'success' : 'danger'}
        />
        <Stat
          label={t('rep.netProfit')}
          value={money(summary.netProfit)}
          tone={summary.netProfit >= 0 ? 'success' : 'danger'}
          hint={`${t('rep.expenses')}: ${money(summary.expenses)}`}
        />
      </div>

      <Tabs tabs={tabs} value={tab} onChange={setTab} />

      {!hasData ? (
        <div className="card mt-16">
          <EmptyState icon="chart" title={t('rep.noData')} />
        </div>
      ) : tab === 'overview' ? (
        <div className="col gap-16 mt-16">
          <div className="card">
            <div className="card-head">
              <span className="card-title">{t('rep.byDay')}</span>
              <span className="small dim">{t('rep.avgOrder')}: {money(summary.avgOrder)}</span>
            </div>
            <div className="card-body">
              <BarChart data={byDay} format={(v) => money(v)} height={220} />
            </div>
          </div>

          <div className="grid grid-3">
            <div className="card">
              <div className="card-head">
                <span className="card-title">{t('rep.byPayment')}</span>
              </div>
              <div className="card-body">
                <DonutChart
                  slices={byPayment.map((p, i) => ({
                    key: p.key,
                    label: t(PAY_LABEL[p.key] ?? 'common.other'),
                    value: p.value,
                    color: PALETTE[i % PALETTE.length],
                  }))}
                  centerLabel={t('rep.revenue')}
                  centerValue={money(summary.netRevenue)}
                />
              </div>
            </div>

            <div className="card">
              <div className="card-head">
                <span className="card-title">{t('rep.byCategory')}</span>
              </div>
              <div className="card-body">
                <HBarList
                  rows={byCategory.map((c, i) => ({
                    key: c.key || 'none',
                    label: catNames.get(c.key) ?? t('products.noCategory'),
                    value: c.value,
                    meta: `×${c.count}`,
                    color: PALETTE[i % PALETTE.length],
                  }))}
                  format={(v) => money(v)}
                  emptyLabel={t('rep.noData')}
                />
              </div>
            </div>

            <div className="card">
              <div className="card-head">
                <span className="card-title">{t('common.summary')}</span>
              </div>
              <div className="card-body col gap-4">
                <SummaryRow label={t('rep.revenue')} value={money(summary.revenue)} />
                <SummaryRow label={t('rep.discounts')} value={`-${money(summary.discount)}`} />
                <SummaryRow label={t('rep.refunds')} value={`-${money(summary.refunds)}`} />
                <SummaryRow label={t('rep.cogs')} value={`-${money(summary.cogs)}`} />
                {summary.tax > 0 && <SummaryRow label={t('common.tax')} value={money(summary.tax)} />}
                {taxLines.length > 1 &&
                  taxLines.map((tl) => (
                    <SummaryRow
                      key={tl.rateBp}
                      label={`  ${tl.rateBp / 100}% (${money(tl.gross)})`}
                      value={money(tl.tax)}
                    />
                  ))}
                <div className="divider" style={{ margin: '6px 0' }} />
                <SummaryRow label={t('rep.grossProfit')} value={money(summary.grossProfit)} strong />
                <SummaryRow label={t('rep.expenses')} value={`-${money(summary.expenses)}`} />
                <SummaryRow label={t('rep.netProfit')} value={money(summary.netProfit)} strong />
                <div className="divider" style={{ margin: '6px 0' }} />
                <SummaryRow label={t('rep.itemsSold')} value={formatNumber(summary.itemsSold, settings.lang)} />
                <SummaryRow label={t('orders.statusVoid')} value={String(summary.voidCount)} />
              </div>
            </div>
          </div>
        </div>
      ) : tab === 'products' ? (
        <div className="card mt-16">
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>#</th>
                  <th>{t('common.name')}</th>
                  <th className="right">{t('rep.quantitySold')}</th>
                  <th className="right">{t('rep.revenue')}</th>
                  <th className="right">{t('common.profit')}</th>
                  <th className="right">{t('rep.share')}</th>
                </tr>
              </thead>
              <tbody>
                {top.map((p, i) => (
                  <tr key={p.productId}>
                    <td className="dim">{i + 1}</td>
                    <td className="strong">{p.name}</td>
                    <td className="right num">{formatNumber(p.qty, settings.lang)}</td>
                    <td className="right num">{money(p.revenue)}</td>
                    <td className={`right num ${p.profit >= 0 ? 'text-success' : 'text-danger'}`}>
                      {money(p.profit)}
                    </td>
                    <td className="right num dim">
                      {summary.netRevenue ? ((p.revenue / summary.netRevenue) * 100).toFixed(1) : '0.0'}%
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : tab === 'time' ? (
        <div className="col gap-16 mt-16">
          <div className="card">
            <div className="card-head">
              <span className="card-title">{t('rep.byHour')}</span>
              {peak && <span className="badge badge-brand">{t('rep.peakHour')}: {peak.label}</span>}
            </div>
            <div className="card-body">
              <BarChart data={byHour} format={(v) => money(v)} height={220} />
            </div>
          </div>
          <div className="card">
            <div className="card-head">
              <span className="card-title">{t('pos.orderType')}</span>
            </div>
            <div className="card-body">
              <HBarList
                rows={byType.map((r, i) => ({
                  key: r.key,
                  label: t(TYPE_LABEL[r.key] ?? 'common.other'),
                  value: r.value,
                  meta: `${r.count}`,
                  color: PALETTE[i % PALETTE.length],
                }))}
                format={(v) => money(v)}
                emptyLabel={t('rep.noData')}
              />
            </div>
          </div>
        </div>
      ) : (
        <div className="card mt-16">
          <div className="card-head">
            <span className="card-title">{t('rep.byEmployee')}</span>
          </div>
          <div className="card-body">
            <HBarList
              rows={byEmployee.map((r, i) => ({
                key: r.key || 'none',
                label: r.name,
                value: r.value,
                meta: t('orders.itemsCount', { n: r.count }),
                color: PALETTE[i % PALETTE.length],
              }))}
              format={(v) => money(v)}
              emptyLabel={t('rep.noData')}
            />
          </div>
        </div>
      )}
    </div>
  );
}

function SummaryRow({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className="row between" style={{ fontWeight: strong ? 700 : undefined }}>
      <span className={strong ? '' : 'muted'}>{label}</span>
      <span className="num">{value}</span>
    </div>
  );
}
