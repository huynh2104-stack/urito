import { useMemo, useState } from 'react';
import { Button, Checkbox, EmptyState, Field, NumberInput, SearchInput, Select } from '@/components/ui';
import { Barcode } from '@/components/Barcode';
import { db } from '@/db/db';
import { useLiveQuery } from '@/lib/useLiveQuery';
import { generateInternalBarcode } from '@/lib/barcode';
import { useApp, useMoney, useT } from '@/store/app';
import { navigate } from '@/router';
import { toast } from '@/store/ui';
import { printDocument } from '@/print/PrintHost';
import { compareProductNames, matchesProduct } from '@/core/search';
import type { Product } from '@/db/types';

type LabelSize = 'roll-50x30' | 'roll-40x25' | 'a4-65';

const SIZES: Record<LabelSize, { page: string; w: string; h: string; perSheet: number }> = {
  'roll-50x30': { page: '50mm 30mm', w: '50mm', h: '30mm', perSheet: 1 },
  'roll-40x25': { page: '40mm 25mm', w: '40mm', h: '25mm', perSheet: 1 },
  'a4-65': { page: 'A4', w: '38.1mm', h: '21.2mm', perSheet: 65 },
};

async function assignMissingBarcodes(missing: Product[], allProducts: Product[]): Promise<number> {
  const taken = new Set(allProducts.map((p) => p.barcode).filter(Boolean));
  const now = Date.now();
  for (const p of missing) {
    const code = generateInternalBarcode(taken);
    taken.add(code);
    await db.products.update(p.id, { barcode: code, updatedAt: now });
  }
  return missing.length;
}

export function LabelsPage() {
  const t = useT();
  const money = useMoney();
  const shopName = useApp((s) => s.settings.shopName);

  const [search, setSearch] = useState('');
  const [copies, setCopies] = useState<Record<string, number>>({});
  const lang = useApp((s) => s.settings.lang);
  const [size, setSize] = useState<LabelSize>('roll-50x30');
  const [showShop, setShowShop] = useState(true);
  const [showPrice, setShowPrice] = useState(true);

  const products = useLiveQuery(async () => db.products.filter((p) => p.active).toArray(), [], [] as Product[]);

  const visible = useMemo(() => {
    return products
      .filter((p) => matchesProduct(p, search))
      .sort((a, b) => compareProductNames(a, b, lang));
  }, [products, search, lang]);

  const chosen = products.filter((p) => (copies[p.id] ?? 0) > 0);
  const totalLabels = chosen.reduce((s, p) => s + (copies[p.id] ?? 0), 0);

  const fillMissingBarcodes = async () => {
    const missing = chosen.filter((p) => !p.barcode);
    if (!missing.length) return;
    const count = await assignMissingBarcodes(missing, products);
    toast.success(t('label.generated', { n: count }));
  };

  const print = () => {
    const spec = SIZES[size];
    const labels: Product[] = [];
    for (const p of chosen) for (let i = 0; i < (copies[p.id] ?? 0); i++) labels.push(p);
    printDocument(
      <div className={`bc-label-sheet ${spec.perSheet > 1 ? 'bc-label-sheet-a4' : ''}`}>
        <style>{`@page { size: ${spec.page}; margin: ${spec.perSheet > 1 ? '10.7mm 4.7mm' : '0'}; }`}</style>
        {labels.map((p, i) => (
          <div key={i} className="bc-label" style={{ width: spec.w, height: spec.h }}>
            {showShop && <div className="bc-label-shop">{shopName}</div>}
            <div className="bc-label-name">{p.name}</div>
            {showPrice && <div className="bc-label-price">{money(p.price)}</div>}
            {p.barcode ? <Barcode value={p.barcode} height={30} /> : <div className="bc-label-code">{p.sku}</div>}
          </div>
        ))}
      </div>,
    );
  };

  return (
    <div className="page page-wide">
      <div className="page-head">
        <div>
          <div className="page-title">{t('label.title')}</div>
          <div className="page-sub">{t('label.subtitle')}</div>
        </div>
        <div className="row gap-8">
          <Button icon="chevronLeft" onClick={() => navigate('/products')}>
            {t('products.title')}
          </Button>
          <Button variant="primary" icon="print" disabled={!totalLabels} onClick={print}>
            {t('label.print', { n: totalLabels })}
          </Button>
        </div>
      </div>

      <div className="grid grid-2" style={{ gridTemplateColumns: 'minmax(0,1.5fr) minmax(0,1fr)', alignItems: 'start' }}>
        <div className="card">
          <div className="card-head">
            <SearchInput value={search} onChange={setSearch} placeholder={t('common.searchPlaceholder')} />
          </div>
          {visible.length === 0 ? (
            <EmptyState icon="barcode" title={t('products.noProducts')} />
          ) : (
            <div style={{ maxHeight: '62vh', overflowY: 'auto' }}>
              {visible.map((p) => (
                <div key={p.id} className="list-row">
                  <div className="thumb-sm" style={p.image ? undefined : { background: `${p.color}1f`, color: p.color }}>
                    {p.image ? <img src={p.image} alt="" /> : p.name.slice(0, 1)}
                  </div>
                  <div className="grow">
                    <div className="strong truncate">{p.name}</div>
                    <div className="tiny dim mono">{p.barcode || t('label.noBarcode')}</div>
                  </div>
                  <span className="num small">{money(p.price)}</span>
                  <div style={{ width: 84 }}>
                    <NumberInput
                      value={copies[p.id] ?? 0}
                      min={0}
                      onChange={(v) => setCopies({ ...copies, [p.id]: Math.max(0, Math.round(v)) })}
                    />
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="col gap-16">
          <div className="card card-body col gap-12">
            <Field label={t('label.size')}>
              <Select value={size} onChange={(e) => setSize(e.target.value as LabelSize)}>
                <option value="roll-50x30">{t('label.roll')} 50 × 30 mm</option>
                <option value="roll-40x25">{t('label.roll')} 40 × 25 mm</option>
                <option value="a4-65">{t('label.a4')}</option>
              </Select>
            </Field>
            <Checkbox checked={showShop} onChange={setShowShop} label={t('label.showShop')} />
            <Checkbox checked={showPrice} onChange={setShowPrice} label={t('label.showPrice')} />
            {chosen.some((p) => !p.barcode) && (
              <div className="callout callout-warn">
                <div className="mb-8">{t('label.missingBarcode')}</div>
                <Button size="sm" onClick={() => void fillMissingBarcodes()}>
                  {t('products.autoCode')}
                </Button>
              </div>
            )}
          </div>

          <div className="card card-body">
            <div className="card-title mb-12">{t('set.previewReceipt')}</div>
            {chosen[0] ? (
              <div className="bc-label bc-label-preview" style={{ width: SIZES[size].w, height: SIZES[size].h }}>
                {showShop && <div className="bc-label-shop">{shopName}</div>}
                <div className="bc-label-name">{chosen[0].name}</div>
                {showPrice && <div className="bc-label-price">{money(chosen[0].price)}</div>}
                {chosen[0].barcode ? (
                  <Barcode value={chosen[0].barcode} height={30} />
                ) : (
                  <div className="bc-label-code">{chosen[0].sku}</div>
                )}
              </div>
            ) : (
              <div className="small dim">{t('label.pickHint')}</div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
