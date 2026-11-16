import { Button } from '@/components/ui';
import { navigate } from '@/router';
import { useT } from '@/store/app';
import { FEATURES, type FeatureEntry, type FeatureStatus } from '@/features/registry';
import type { TranslationKey } from '@/i18n';

const ORDER: FeatureStatus[] = ['stable', 'beta', 'wip', 'planned'];

const STATUS_META: Record<FeatureStatus, { labelKey: TranslationKey; cls: string }> = {
  stable: { labelKey: 'roadmap.statusStable', cls: 'badge-success' },
  beta: { labelKey: 'roadmap.statusBeta', cls: 'badge-info' },
  wip: { labelKey: 'roadmap.statusWip', cls: 'badge-warn' },
  planned: { labelKey: 'roadmap.statusPlanned', cls: 'badge-brand' },
};

/** E-01: 機能ステータス台帳（FEATURES）を表示する「開発状況」画面。 */
export function RoadmapPage() {
  const t = useT();

  const grouped = new Map<FeatureStatus, FeatureEntry[]>();
  for (const s of ORDER) grouped.set(s, []);
  for (const f of FEATURES) grouped.get(f.status)?.push(f);

  return (
    <div className="page page-narrow">
      <div className="page-head">
        <div>
          <h1 className="page-title">{t('roadmap.title')}</h1>
          <div className="page-sub">{t('roadmap.subtitle')}</div>
        </div>
      </div>

      <div className="col gap-16">
        {ORDER.map((status) => {
          const items = grouped.get(status) ?? [];
          if (!items.length) return null;
          const meta = STATUS_META[status];
          return (
            <div className="card card-body col gap-10" key={status}>
              <div className="row gap-8" style={{ alignItems: 'center' }}>
                <span className={`badge ${meta.cls}`}>{t(meta.labelKey)}</span>
                <span className="muted small">{items.length}</span>
              </div>
              <div className="col gap-8">
                {items.map((item) => (
                  <div
                    key={item.id}
                    className="row between gap-12"
                    style={{
                      padding: '8px 0',
                      borderTop: '1px solid var(--c-border)',
                      alignItems: 'center',
                    }}
                  >
                    <div style={{ minWidth: 0 }}>
                      <div className="row gap-8" style={{ alignItems: 'center' }}>
                        <strong>{t(item.titleKey)}</strong>
                        <span className="tiny muted">
                          {t('roadmap.since')} v{item.since}
                        </span>
                      </div>
                      {item.descKey && <div className="small muted mt-4">{t(item.descKey)}</div>}
                    </div>
                    {item.path && status !== 'planned' && (
                      <Button size="sm" onClick={() => navigate(item.path!)}>
                        {t('roadmap.openFeature')}
                      </Button>
                    )}
                  </div>
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
