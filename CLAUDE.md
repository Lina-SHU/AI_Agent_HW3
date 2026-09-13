# CLAUDE.md

本文件提供 Claude Code (claude.ai/code) 在此專案中工作時所需的指引。

## 專案概述

花卉電商網站 — Node.js + Express.js + SQLite + EJS (SSR) + Tailwind CSS + Vitest

## 常用指令

```bash
# 啟動正式環境（先建置 CSS 再啟動伺服器）
npm start

# 開發模式（分兩個終端機）
npm run dev:server   # Express on port 3001
npm run dev:css      # 監看並重新編譯 Tailwind

# 建置 CSS（壓縮版）
npm run css:build

# 執行測試
npm test
npx vitest run tests/auth.test.js   # 執行單一測試檔

# 產生 OpenAPI 規格檔
npm run openapi
```

## 關鍵規則

- **雙模式購物車認證**：購物車 API 同時支援 JWT Bearer token（已登入）與 `X-Session-Id` header（訪客），兩者邏輯路徑不同，修改 cartRoutes.js 時須同時考量。
- **訂單建立使用 Transaction**：建立訂單時，insert orders、insert order_items、update stock、delete cart_items 四步包在同一個 SQLite transaction 中，中途失敗會回滾。
- **商品欄位為快照**：order_items 的 `product_name` 與 `product_price` 是建單時的快照，不參照 products 表，確保歷史訂單不受商品修改影響。
- **測試必須循序執行**：vitest.config.js 設定 `fileParallelism: false`，測試依賴共享的 SQLite 記憶體資料庫，不可並行。
- **功能開發流程**：在 `docs/plans/` 建立計畫檔（YYYY-MM-DD-feature-name.md），完成後移至 `docs/plans/archive/`，並更新 FEATURES.md 與 CHANGELOG.md。

## 詳細文件

- [docs/README.md](./docs/README.md) — 專案介紹與快速開始
- [docs/ARCHITECTURE.md](./docs/ARCHITECTURE.md) — 架構、目錄結構、資料流
- [docs/DEVELOPMENT.md](./docs/DEVELOPMENT.md) — 開發規範、命名規則、新增模組步驟
- [docs/FEATURES.md](./docs/FEATURES.md) — 功能列表、行為描述、完成狀態
- [docs/TESTING.md](./docs/TESTING.md) — 測試規範與指南
- [docs/CHANGELOG.md](./docs/CHANGELOG.md) — 更新日誌
