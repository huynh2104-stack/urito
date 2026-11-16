# Urito POS 技術アーキテクチャ

## 技術スタック

| 領域 | 採用技術 | 採用理由 |
|---|---|---|
| フロントエンド | React 19 + TypeScript (`strict`) + Vite 6 | 静的解析による安全性と高速ビルド |
| 状態管理 | Zustand (`useApp`, `useCart`, `useUI`) | セレクタ購読による POS 描画の局所化 |
| 永続化 | Dexie 4 (IndexedDB スキーマ v7, 全20テーブル) | 完全オフライン動作と単一トランザクション整合性 |
| オフライン | Vite プラグイン生成 `dist/sw.js` | HTML Network-First / ハッシュ付きアセット Cache-First |
| 検証 | Vitest + `fake-indexeddb` + `fast-check` | 通貨整数演算・マイグレーション・権限・在庫整合性検証 |

## スキーマ設計とマイグレーション履歴 (`src/db/migrations/`)

- **v1**: 基本テーブル一式（`settings`, `users`, `categories`, `modifierGroups`, `products`, `customers`, `suppliers`, `areas`, `diningTables`, `orders`, `stockMovements`, `purchases`, `shifts`, `cashMovements`, `expenses`, `promotions`, `kv`）。
- **v2 / v3**: 日本インボイス税制区分・端数丸めルール・かな検索・週開始曜日の追加。
- **v4 (C-01)**: `productImages` テーブルを追加し、商品画像バイナリを `products` から分離（バックグラウンド移行 + LRU ObjectURL キャッシュ最大300件）。
- **v5 (C-04)**: `dailyStats`（`day` 主キー）および `dailyProductStats`（`[day+productId]`）を追加し、ダッシュボードと期間レポートの全伝票走査を排除。
- **v6 (F-02)**: 多言語カタログ (`Product.i18n`)・外貨価格 (`Product.prices`)・為替設定 (`Settings.exchangeRates`) に対応。
- **v7 (F-03)**: `orders` に複合インデックス `[channel+externalId]` を追加し、EC 受注 CSV の冪等インポートを保証。

## セキュリティと会計整合性

- **PIN ハッシュ化**: `src/core/pin.ts` にて PBKDF2-SHA256（ランダム16バイトソルト、150,000イテレーション、定数時間比較）と5回連続失敗時の30秒ロックアウトを実装。バックアップ JSON に平文 PIN を出力せず、旧バックアップ取込時に自動ハッシュ化。
- **整数通貨計算**: `src/core/money.ts` / `src/core/tax.ts` / `src/core/refund.ts` にて最小通貨単位（JPY/VND = 1、USD = 1セント）の整数のみで税額・割引按分・返金額を計算し、浮動小数点誤差を構造的に防止。
- **Gzip 圧縮バックアップ**: `src/services/backup.ts` はブラウザ標準 `CompressionStream('gzip')` による `.json.gz`（`format: 2`）を出力し、復元・マージ時には先頭バイト（`0x1f 0x8b`）で旧 `.json`（`format: 1`）と自動判別。

## バンドル予算 (`perf-budget.json`)

- 初期ロード JS gzip 上限: `143,360 B` (140.00 KB) — 実測 `135.90 KB` (`vendor-react` + `vendor-dexie` + `index`)
- CSS gzip 上限: `20,480 B` (20.00 KB) — 実測 `13.93 KB`
- Webフォント上限: `307,200 B` (300.00 KB) — 実測 `168.19 KB`（ベトナム語選択時のみ動的読込）
