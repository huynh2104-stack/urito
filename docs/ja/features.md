# Urito POS 機能台帳

> このファイルは `npm run docs:features` により [registry.ts](../../src/features/registry.ts) から自動生成されます。手動編集しないでください。

| ID | 機能名 | 状態 | 導入バージョン | パス | 概要 |
|---|---|---|---|---|---|
| `pos` | レジ | 安定版 (stable) | v0.1 | `/pos` |  |
| `orders` | 取引履歴 | 安定版 (stable) | v0.1 | `/orders` |  |
| `products` | 商品管理 | 安定版 (stable) | v0.1 | `/products` |  |
| `inventory` | 在庫管理 | 安定版 (stable) | v0.2 | `/inventory` |  |
| `purchases` | 仕入伝票 | 安定版 (stable) | v0.2 | `/purchases` |  |
| `customers` | 顧客管理 | 安定版 (stable) | v0.2 | `/customers` |  |
| `shifts` | シフト | 安定版 (stable) | v0.2 | `/shifts` |  |
| `expenses` | 経費 | 安定版 (stable) | v0.3 | `/expenses` |  |
| `reports` | 売上レポート | 安定版 (stable) | v0.3 | `/reports` |  |
| `users` | スタッフ | 安定版 (stable) | v0.3 | `/users` |  |
| `backup` | バックアップ | 安定版 (stable) | v0.4 | `/backup` |  |
| `labels` | バーコードラベル印刷 | 安定版 (stable) | v0.4 | `/labels` |  |
| `tax-invoice` | 軽減税率・インボイス対応 | 安定版 (stable) | v0.6 | `/settings` | 商品別8%/10%・店内飲食切替・適格簡易請求書と領収書発行に対応します。 |
| `tables` | テーブル | ベータ (beta) | v0.3 | `/tables` |  |
| `camera-scan` | カメラバーコード読取 | ベータ (beta) | v0.4 | — | 対応ブラウザのカメラ（BarcodeDetector）でJAN・コードを読み取ります。 |
| `delivery` | 配送注文対応 | 開発中 (wip) | v0.5 | — | 配達先管理や配送ステータス追跡に対応予定です。 |
| `receipt-qr` | レシートQRコード印字 | 開発中 (wip) | v0.5 | — | レシート下部への決済QRコード印字を整備中です。 |
| `shopify-csv` | Shopify連携CSV出力 | 安定版 (stable) | v0.6 | `/products` | Shopify公式商品CSV形式での商品データの双方向インポート・エクスポートに対応します。 |
| `multilang-catalog` | 商品カタログ多言語・多通貨 | 安定版 (stable) | v0.6 | `/products` | 1商品ごとの多言語名・説明・通貨別価格の登録とレシート印字言語の切替に対応します。 |
| `ec-orders` | EC受注取込・共通在庫 | 安定版 (stable) | v0.6 | `/orders` | Shopify等の受注CSVを重複防止付きで取り込み、在庫引当と売上集計へ自動反映します。 |
