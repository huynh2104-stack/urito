import { useMemo, useState } from 'react';
import { Button, EmptyState, Stat } from '@/components/ui';
import { BarChart, HBarList } from '@/components/charts';
import { Icon } from '@/components/Icon';
import { db } from '@/db/db';
import { useLiveQuery } from '@/lib/useLiveQuery';
import { dayKey, DAY, formatTime, rangeOf, startOfDay } from '@/core/date';
import { useApp, useCan, useMoney, useT } from '@/store/app';
import { navigate } from '@/router';
import { growth } from '@/services/reports';
import { ensureRollupsBuilt } from '@/services/rollups';
import { productStatsFromRollups, revenueByDayFromRollups, summariseRollups } from '@/services/rollupQueries';
import { summariseStock } from '@/services/inventory';
import type { DailyProductStatsRow, DailyStatsRow, Order } from '@/db/types';

export function DashboardPage() {
  const t = useT();
  const money = useMoney();
  const { settings, user } = useApp();
  const lang = settings.lang;
  const seesProfit = useCan('viewReports');
  const seesStock = useCan('manageInventory');

  const [now] = useState(() => Date.now());
  const since = startOfDay(now - 7 * DAY);
  const today = rangeOf('today', now);
  const yesterday = rangeOf('yesterday', now);
  const todayDay = dayKey(today.from);
  const yesterdayDay = dayKey(yesterday.from);
  const sinceDay = dayKey(since);
  const nowDay = dayKey(now);

  const dailyRows = useLiveQuery(
    async () => {
      await ensureRollupsBuilt();
      return db.dailyStats.where('day').between(sinceDay, nowDay, true, true).toArray();
    },
    [sinceDay, nowDay],
    [] as DailyStatsRow[],
  );
  const todayProdRows = useLiveQuery(
    async () => {
      await ensureRollupsBuilt();
      return db.dailyProductStats.where('day').equals(todayDay).toArray();
    },
    [todayDay],
    [] as DailyProductStatsRow[],
  );
  const recent = useLiveQuery(
    async () => {
      const list = await db.orders.where('paidAt').between(today.from, today.to, true, true).reverse().limit(12).toArray();
      return list.filter((o) => o.status !== 'open').slice(0, 6);
    },
    [today.from, today.to],
    [] as Order[],
  );
  const products = useLiveQuery(async () => db.products.toArray(), [], []);
  const openOrders = useLiveQuery(
    async () => db.orders.where('status').equals('open').toArray(),
    [],
    [] as Order[],
  );

  const todaySummary = useMemo(
    () => summariseRollups(dailyRows.filter((r) => r.day === todayDay)),
    [dailyRows, todayDay],
  );
  const yesterdaySummary = useMemo(
    () => summariseRollups(dailyRows.filter((r) => r.day === yesterdayDay)),
    [dailyRows, yesterdayDay],
  );
  const series = useMemo(
    () => revenueByDayFromRollups(dailyRows, since, now, lang),
    [dailyRows, since, now, lang],
  );
  const top = useMemo(() => productStatsFromRollups(todayProdRows).slice(0, 5), [todayProdRows]);
  const stock = useMemo(() => summariseStock(products), [products]);

  const backupAgeDays = settings.backup.lastAt
    ? Math.floor((now - settings.backup.lastAt) / DAY)
    : -1;

  return (
    <div className="page page-wide">
      <div className="page-head">
        <div>
          <div className="page-title">{t('dash.hello', { name: user?.name ?? '' })}</div>
          <div className="page-sub">{new Date().toLocaleDateString(lang === 'ja' ? 'ja-JP' : lang === 'vi' ? 'vi-VN' : 'en-US', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}</div>
        </div>
        <div className="row gap-8">
          <Button icon="pos" variant="primary" onClick={() => navigate('/pos')}>
            {t('dash.startSelling')}
          </Button>
          {seesProfit && (
            <Button icon="chart" onClick={() => navigate('/reports')}>
              {t('nav.reports')}
            </Button>
          )}
        </div>
      </div>

      {seesProfit && (backupAgeDays < 0 || backupAgeDays >= 3) && (
        <div className="callout callout-warn mb-16">
          <div className="row between wrap gap-8">
            <span className="row gap-8">
              <Icon name="cloud" size={16} />
              {backupAgeDays < 0 ? t('dash.backupReminder') : t('dash.backupOld', { days: backupAgeDays })}
            </span>
            <Button size="sm" onClick={() => navigate('/backup')}>
              {t('dash.setupBackup')}
            </Button>
          </div>
        </div>
      )}

      <div className="grid grid-4 mb-16">
        <Stat
          icon="wallet"
          label={t('dash.revenueToday')}
          value={money(todaySummary.netRevenue)}
          delta={growth(todaySummary.netRevenue, yesterdaySummary.netRevenue)}
          hint={t('dash.vsYesterday')}
        />
        <Stat
          icon="receipt"
          label={t('dash.ordersToday')}
          value={String(todaySummary.orderCount)}
          delta={growth(todaySummary.orderCount, yesterdaySummary.orderCount)}
          hint={t('dash.vsYesterday')}
        />
        <Stat icon="chart" label={t('dash.avgToday')} value={money(todaySummary.avgOrder)} />
        {seesProfit ? (
          <Stat
            icon="trendingUp"
            label={t('dash.profitToday')}
            value={money(todaySummary.grossProfit)}
            tone={todaySummary.grossProfit >= 0 ? 'success' : 'danger'}
          />
        ) : (
          <Stat icon="box" label={t('rep.itemsSold')} value={String(todaySummary.itemsSold)} />
        )}
      </div>

      <div className="grid grid-2 mb-16" style={{ gridTemplateColumns: 'minmax(0,1.6fr) minmax(0,1fr)' }}>
        <div className="card">
          <div className="card-head">
            <span className="card-title">{t('dash.last7Days')}</span>
          </div>
          <div className="card-body">
            <BarChart data={series} format={(v) => money(v)} />
          </div>
        </div>

        <div className="card">
          <div className="card-head">
            <span className="card-title">{t('dash.topToday')}</span>
          </div>
          <div className="card-body">
            <HBarList
              rows={top.map((p) => ({
                key: p.productId,
                label: p.name,
                value: p.revenue,
                meta: `×${p.qty}`,
              }))}
              format={(v) => money(v)}
              emptyLabel={t('dash.noOrdersToday')}
            />
          </div>
        </div>
      </div>

      <div className="grid grid-2">
        <div className="card">
          <div className="card-head">
            <span className="card-title">{t('dash.recentOrders')}</span>
            <Button size="sm" variant="ghost" onClick={() => navigate('/orders')}>
              {t('common.more')}
            </Button>
          </div>
          {recent.length === 0 ? (
            <EmptyState icon="receipt" title={t('dash.noOrdersToday')} />
          ) : (
            <div>
              {recent.map((order) => (
                <button
                  key={order.id}
                  type="button"
                  className="list-row w-full"
                  style={{ background: 'none', border: 0, textAlign: 'left' }}
                  onClick={() => navigate(`/orders?id=${order.id}`)}
                >
                  <div className="grow">
                    <div className="strong">{order.code}</div>
                    <div className="tiny dim">
                      {formatTime(order.paidAt || order.createdAt, lang)} · {order.userName}
                      {order.tableName ? ` · ${order.tableName}` : ''}
                    </div>
                  </div>
                  <span className={`badge ${order.status === 'paid' ? 'badge-success' : order.status === 'void' ? 'badge-danger' : 'badge-warn'}`}>
                    {t(order.status === 'paid' ? 'orders.statusPaid' : order.status === 'void' ? 'orders.statusVoid' : 'orders.statusRefunded')}
                  </span>
                  <span className="num strong">{money(order.total)}</span>
                </button>
              ))}
            </div>
          )}
        </div>

        <div className="col gap-16">
          {settings.businessType !== 'retail' && (
            <div className="card card-pad">
              <div className="row between">
                <span className="card-title">{t('dash.openTables')}</span>
                <span className="badge badge-brand">{openOrders.filter((o) => o.tableId).length}</span>
              </div>
              <div className="row wrap gap-4 mt-8">
                {openOrders.filter((o) => o.tableId).map((o) => (
                  <button
                    key={o.id}
                    type="button"
                    className="chip active"
                    onClick={() => navigate(`/pos?order=${o.id}`)}
                  >
                    {o.tableName} · {money(o.total)}
                  </button>
                ))}
                {openOrders.filter((o) => o.tableId).length === 0 && (
                  <span className="small dim">{t('tab.available')}</span>
                )}
              </div>
            </div>
          )}

          {seesStock && <div className="card">
            <div className="card-head">
              <span className="card-title">{t('dash.lowStockTitle')}</span>
              <Button size="sm" variant="ghost" onClick={() => navigate('/inventory')}>
                {t('common.more')}
              </Button>
            </div>
            {stock.lowStock.length + stock.outOfStock.length === 0 ? (
              <div className="empty small">{t('inv.inStock')}</div>
            ) : (
              <div>
                {[...stock.outOfStock, ...stock.lowStock].slice(0, 6).map((p) => (
                  <div key={p.id} className="list-row">
                    <span className="grow truncate">{p.name}</span>
                    <span className={`badge ${p.stock <= 0 ? 'badge-danger' : 'badge-warn'}`}>
                      {p.stock <= 0 ? t('inv.outOfStock') : `${p.stock} / ${p.minStock}`}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>}
        </div>
      </div>
    </div>
  );
}
