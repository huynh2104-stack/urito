import { useState } from 'react';
import { Button, Modal } from '@/components/ui';
import { ProductThumb } from '@/components/ProductThumb';
import { db } from '@/db/db';
import { newId } from '@/core/id';
import { parseCsv } from '@/services/csv';
import { readXlsx } from '@/services/xlsx';
import { PALETTE } from '@/db/defaults';
import { isShopifyProductCsv, parseShopifyProductCsv } from '@/services/exchange/shopify';
import { parseUritoProductTable } from '@/services/exchange/urito';
import type { ExchangeFormat, ExchangeProductRow } from '@/services/exchange/types';
import { useApp, useT } from '@/store/app';
import { toast } from '@/store/ui';
import type { Category, Product, StockMovement } from '@/db/types';

type Row = ExchangeProductRow;

export function ImportProductsModal({
  categories,
  onClose,
}: {
  categories: Category[];
  onClose: () => void;
}) {
  const t = useT();
  const settings = useApp((s) => s.settings);
  const currency = settings.currency;
  const user = useApp((s) => s.user);
  const [rows, setRows] = useState<Row[]>([]);
  const [format, setFormat] = useState<ExchangeFormat | null>(null);
  const [existing, setExisting] = useState<Map<string, Product>>(new Map());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [fileName, setFileName] = useState('');

  const keyOf = (r: { sku: string; barcode: string }, map: Map<string, Product>) =>
    (r.sku && map.get(`s:${r.sku.toLowerCase()}`)) || (r.barcode && map.get(`b:${r.barcode}`)) || undefined;

  const read = async (file: File) => {
    setError('');
    setRows([]);
    setFileName(file.name);
    try {
      const isXlsx = /\.xlsx$/i.test(file.name);
      const table = isXlsx ? await readXlsx(file) : parseCsv(await file.text());
      if (!table.length) return;

      const detected: ExchangeFormat = !isXlsx && isShopifyProductCsv(table[0]) ? 'shopify' : 'urito';
      setFormat(detected);
      const parsed: Row[] =
        detected === 'shopify'
          ? parseShopifyProductCsv(table, { currency })
          : parseUritoProductTable(table, { currency });

      const list = parsed.filter((r) => r.name);
      const map = new Map<string, Product>();
      for (const p of await db.products.toArray()) {
        if (p.sku) map.set(`s:${p.sku.toLowerCase()}`, p);
        if (p.barcode) map.set(`b:${p.barcode}`, p);
      }
      setExisting(map);
      setRows(list);
      if (!list.length) setError(t('products.importNoRows'));
    } catch (err) {
      console.error(err);
      setError(t('products.importReadError'));
    }
  };

  const updates = rows.filter((r) => keyOf(r, existing)).length;
  const additions = rows.length - updates;

  const commit = async () => {
    if (!rows.length) return;
    setBusy(true);
    try {
      const now = Date.now();
      const catByName = new Map(categories.map((c) => [c.name.toLowerCase(), c]));
      const newCategories: Category[] = [];
      for (const row of rows) {
        const key = row.category.toLowerCase();
        if (row.category && !catByName.has(key)) {
          const created: Category = {
            id: newId('c'),
            name: row.category,
            color: PALETTE[(categories.length + newCategories.length) % PALETTE.length],
            sort: categories.length + newCategories.length,
            active: true,
          };
          newCategories.push(created);
          catByName.set(key, created);
        }
      }

      const products: Product[] = [];
      const movements: StockMovement[] = [];
      const seen = new Set<string>();
      let created = 0;
      let updated = 0;

      rows.forEach((row, i) => {
        const dupKey = row.sku ? `s:${row.sku.toLowerCase()}` : '';
        if (dupKey && seen.has(dupKey)) return; // same code twice in the file: first one wins
        if (dupKey) seen.add(dupKey);

        const old = keyOf(row, existing);
        const categoryId = catByName.get(row.category.toLowerCase())?.id ?? old?.categoryId ?? '';
        const tracked = !row.isService;
        const stock = row.stock ?? old?.stock ?? 0;

        if (old) {
          updated++;
          products.push({
            ...old,
            name: row.name,
            sku: row.sku || old.sku,
            barcode: row.barcode || old.barcode,
            categoryId,
            unit: row.unit || old.unit,
            price: row.price,
            cost: row.cost,
            trackStock: tracked,
            stock,
            minStock: row.minStock ?? old.minStock,
            isService: row.isService,
            active: row.active,
            taxCategory: row.taxable ? old.taxCategory : 'exempt',
            i18n: row.description ? { ...old.i18n, [settings.lang]: { ...old.i18n?.[settings.lang], description: row.description } } : old.i18n,
            image: row.image || old.image,
            updatedAt: now,
          });
        } else {
          created++;
          const id = newId('p');
          products.push({
            id,
            sku: row.sku,
            barcode: row.barcode,
            name: row.name,
            categoryId,
            price: row.price,
            cost: row.cost,
            unit: row.unit,
            trackStock: tracked,
            stock,
            minStock: row.minStock ?? 0,
            isService: row.isService,
            active: row.active,
            taxCategory: row.taxable ? 'standard' : 'exempt',
            i18n: row.description ? { [settings.lang]: { description: row.description } } : undefined,
            color: catByName.get(row.category.toLowerCase())?.color ?? PALETTE[i % PALETTE.length],
            image: row.image,
            modifierGroupIds: [],
            favorite: false,
            sort: i,
            createdAt: now,
            updatedAt: now,
          });
          if (tracked && stock !== 0) {
            movements.push({
              id: newId('sm'),
              productId: id,
              productName: row.name,
              type: 'init',
              qty: stock,
              before: 0,
              after: stock,
              cost: row.cost,
              refType: 'import',
              refId: '',
              note: fileName,
              userId: user?.id ?? '',
              userName: user?.name ?? '',
              at: now,
            });
          }
        }
      });

      await db.transaction('rw', [db.categories, db.products, db.stockMovements], async () => {
        if (newCategories.length) await db.categories.bulkPut(newCategories);
        await db.products.bulkPut(products);
        if (movements.length) await db.stockMovements.bulkPut(movements);
      });

      toast.success(t('products.importedDetail', { added: created, updated }));
      onClose();
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      open
      onClose={onClose}
      size="xl"
      title={t('products.importCsv')}
      footer={
        <>
          <Button onClick={onClose}>{t('common.cancel')}</Button>
          <Button variant="primary" disabled={!rows.length || busy} onClick={() => void commit()}>
            {t('common.import')} ({rows.length})
          </Button>
        </>
      }
    >
      <div className="col gap-16">
        <div className="callout">
          {t('products.csvHint')}
          <div className="small muted mt-4">{t('products.importXlsxHint')}</div>
        </div>

        <input
          className="input"
          type="file"
          accept=".xlsx,.csv,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) void read(file);
          }}
        />

        {error && <div className="callout callout-danger">{error}</div>}

        {rows.length > 0 && (
          <>
            <div className="row gap-8 wrap">
              {format && <span className="badge badge-neutral">{t('products.formatDetected', { format: format === 'shopify' ? 'Shopify CSV' : 'Urito CSV' })}</span>}
              <span className="badge badge-success">{t('products.importNew', { n: additions })}</span>
              <span className="badge badge-info">{t('products.importUpdate', { n: updates })}</span>
            </div>
            <div className="card table-wrap" style={{ maxHeight: 340, overflowY: 'auto' }}>
              <table className="table table-compact">
                <thead>
                  <tr>
                    <th>{t('common.name')}</th>
                    <th>{t('common.category')}</th>
                    <th className="right">{t('common.price')}</th>
                    <th className="right">{t('common.cost')}</th>
                    <th className="right">{t('inv.currentStock')}</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.slice(0, 100).map((r, i) => (
                    <tr key={i}>
                      <td>
                        <div className="row gap-8">
                          <ProductThumb name={r.name} image={r.image} size={30} />
                          <div>
                            <div className="strong">{r.name}</div>
                            {r.sku && <div className="tiny dim">{r.sku}</div>}
                          </div>
                        </div>
                      </td>
                      <td>{r.category}</td>
                      <td className="right num">{r.price.toLocaleString()}</td>
                      <td className="right num">{r.cost.toLocaleString()}</td>
                      <td className="right num">{r.stock ?? '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {rows.length > 100 && <div className="small dim">{t('products.importPreviewCap', { n: rows.length })}</div>}
          </>
        )}
      </div>
    </Modal>
  );
}
