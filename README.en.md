# Urito POS

[日本語](README.md) | [Tiếng Việt](README.vi.md) | [Feature Ledger](docs/ja/features.md) | [Architecture](docs/ja/architecture.md)

An **offline-first, zero-server, zero-subscription** Progressive Web App Point of Sale built for small retail stores, cafes, and restaurants.

## Highlights

- **Local-First Persistence (IndexedDB / Dexie v7)**: All receipts, products, stock ledger entries, customers, and shifts stay inside the browser with atomic Dexie transactions.
- **Offline Ready (Service Worker)**: Once loaded, checkout, stock lookup, barcode scanning, and thermal receipt printing continue without an internet connection.
- **Multi-Rate Tax & Official Receipts**: Per-item tax categories (standard / reduced / exempt), dine-in override rules, itemized tax breakdown receipts, and selectable per-receipt print language (`ja` / `en` / `vi`).
- **Performance Engineered**: Route-level `React.lazy` code splitting, on-demand Webfont loading for Vietnamese, binary image storage with bounded LRU cache (300 entries), and pre-aggregated daily/product rollups keep the initial JS payload at **135.90 KB gzip** (under the 140 KB budget).
- **Shopify & EC Integration**: Bidirectional Shopify Product CSV exchange, multi-language/multi-currency product fields, and idempotent EC order CSV imports (`[channel+externalId]`) with automatic stock deduction.
- **Security & Backups**: PBKDF2-SHA256 salted PIN hashing (150,000 iterations) with 5-attempt lockout, automatic `.json.gz` gzip-compressed folder backups via File System Access API, and multi-device merge recovery.

## Development

```bash
npm install
npm run dev
npm run typecheck && npm run lint && npm test
npm run build && node scripts/check-size.mjs
```

## License

[MIT License](LICENSE)
