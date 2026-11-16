# Urito POS

[English](README.en.md) | [Tiếng Việt](README.vi.md) | [機能一覧](docs/ja/features.md) | [技術構成](docs/ja/architecture.md)

小規模小売店・カフェ・飲食店向けの、**完全オフライン動作・サーバー不要・月額費用0円**のブラウザ型 POS システム（PWA）です。

## 主な特徴

- **完全ローカル永続化（IndexedDB / Dexie）**: 会計・商品・在庫・顧客データを端末内に原子的に保存。専用サーバーやアカウント登録は不要です。
- **オフライン常時稼働（Service Worker）**: 一度読み込めば通信遮断時もレジ操作・在庫照会・レシート印字を継続できます。
- **日本向けインボイス・軽減税率対応**: 8%・10%・非課税の商品別設定、店内飲食（イートイン 10% / テイクアウト 8%）切替、登録番号（`T+13桁`）・※マーク・税率別内訳付きレシート、および5万円以上で収入印紙枠を印字する領収書（`Ryoshusho`）を発行できます。
- **軽量パフォーマンス設計**: `React.lazy` 画面分割、ベトナム語用 Web フォント動的読込、商品画像バイナリ分離と LRU キャッシュ（300件上限）、日次・商品別事前集計テーブル（スキーマ v5）により、初期ロード JS を **135.90 KB（gzip）** に抑えています。
- **Shopify CSV・EC 連携**: Shopify 商品 CSV の双方向入出力、多言語カタログ（`ja`/`en`/`vi`）とレシート印字言語切替、重複防止付き（`[channel+externalId]`）EC 受注 CSV 取込および自動在庫引当に対応します。
- **セキュリティと保守性**: スタッフ PIN は PBKDF2-SHA256（ランダムソルト 16 バイト・150,000 回）でハッシュ化し、5回誤入力でロックアウトします。File System Access API による Gzip 圧縮バックアップ（`.json.gz`）と機種間マージに対応。

## 開発コマンド

```bash
npm install
npm run dev           # 開発サーバー起動 (http://localhost:5173)
npm run typecheck     # TypeScript 型チェック
npm run lint          # ESLint + React Compiler / a11y チェック
npm test              # Vitest 単体・移行・プロパティテスト実行
npm run build         # 本番ビルド + Service Worker (dist/sw.js) 生成
node scripts/check-size.mjs  # バンドルサイズ予算検証 (perf-budget.json)
npm run docs:features # src/features/registry.ts から docs/ja/features.md を生成
npm run build:showcase # LP (site/) + POS (/app/) 統合ビルド -> dist-showcase/
npm run build:shop    # dist/ を Netlify 用 ZIP (urito-netlify-deploy.zip) に梱包
```

## ライセンス

[MIT License](LICENSE)
