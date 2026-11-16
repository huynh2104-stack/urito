import { v2Migration } from './v2';
import type { MigrationDef } from './types';
import type { BusinessType, CurrencyCode, TaxCategory, TaxRounding } from '@/db/types';

/** スキーマ v3（D-01 複数税率・軽減税率対応）：
 *  - 商品へ既定の taxCategory ('standard') を付与する
 *  - 設定へ taxRates / taxRounding / eatInRule を補完する
 *  - 過去の注文データ（orders）は一切書き換えない（互換表示は読み取り時に補完） */
export const v3Migration: MigrationDef = {
  version: 3,
  stores: v2Migration.stores,
  async upgrade(tx) {
    const settingsTable = tx.table<
      {
        id: string;
        currency?: CurrencyCode;
        businessType?: BusinessType;
        taxRate?: number;
        taxRates?: { standard: number; reduced: number };
        taxRounding?: TaxRounding;
        eatInRule?: boolean;
      },
      string
    >('settings');
    const appSettings = await settingsTable.get('app');
    if (appSettings) {
      const stdBp =
        appSettings.taxRates?.standard ??
        (appSettings.taxRate ? Math.round(appSettings.taxRate * 100) : appSettings.currency === 'JPY' ? 1000 : 800);
      await settingsTable.put({
        ...appSettings,
        taxRates: appSettings.taxRates ?? { standard: stdBp, reduced: 800 },
        taxRounding: appSettings.taxRounding ?? (appSettings.currency === 'JPY' ? 'floor' : 'round'),
        eatInRule: appSettings.eatInRule ?? appSettings.businessType !== 'retail',
      });
    }

    const productsTable = tx.table<{ id: string; taxCategory?: TaxCategory }, string>('products');
    await productsTable.toCollection().modify((p) => {
      if (!p.taxCategory) p.taxCategory = 'standard';
    });
  },
};
