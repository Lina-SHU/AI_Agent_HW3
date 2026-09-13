# 花卉電商網站

全端花卉電商示範專案，具備完整的商品瀏覽、購物車、訂單流程與後台管理功能。

## 技術棧

| 層級 | 技術 |
|------|------|
| 後端框架 | Express.js 4.x |
| 資料庫 | SQLite（better-sqlite3 12.x，WAL 模式） |
| 身份驗證 | JWT（jsonwebtoken 9.x，HS256，7 天有效期） |
| 密碼雜湊 | bcrypt 6.x（生產環境 10 rounds） |
| 前端渲染 | EJS 5.x（Server-Side Rendering） |
| CSS 框架 | Tailwind CSS 4.x |
| 測試框架 | Vitest 2.x + supertest 7.x |
| API 文件 | swagger-jsdoc 6.x（OpenAPI 3.0.3） |

## 快速開始

### 環境需求

- Node.js 18+
- npm 9+

### 安裝與啟動

```bash
# 1. 安裝依賴
npm install

# 2. 設定環境變數（複製並修改）
cp .env .env.local
# 必填：JWT_SECRET=<隨機長字串>
# 其餘可沿用預設值

# 3. 啟動開發伺服器（分兩個終端機）
npm run dev:server   # 終端機 1：啟動 API + SSR 伺服器
npm run dev:css      # 終端機 2：監看 CSS 變更

# 4. 瀏覽
# 前台：http://localhost:3001/
# Swagger UI：http://localhost:3001/api-docs
```

### 預設帳號

| 角色 | Email | 密碼 |
|------|-------|------|
| 管理員 | admin@hexschool.com | 12345678 |

（可透過 `.env` 的 `ADMIN_EMAIL` / `ADMIN_PASSWORD` 修改）

## 常用指令

| 指令 | 用途 |
|------|------|
| `npm start` | 建置 CSS + 啟動正式環境 |
| `npm run dev:server` | 開發模式啟動伺服器 |
| `npm run dev:css` | 監看 Tailwind CSS |
| `npm run css:build` | 一次性建置 CSS（壓縮） |
| `npm test` | 執行所有測試 |
| `npm run openapi` | 產生 openapi.json |

## 文件索引

| 文件 | 說明 |
|------|------|
| [ARCHITECTURE.md](./ARCHITECTURE.md) | 目錄結構、啟動流程、API 路由總覽、資料庫 Schema、認證機制 |
| [FEATURES.md](./FEATURES.md) | 所有功能的詳細行為描述、錯誤碼、業務邏輯 |
| [DEVELOPMENT.md](./DEVELOPMENT.md) | 開發規範、命名規則、新增模組步驟、環境變數說明 |
| [TESTING.md](./TESTING.md) | 測試架構、執行順序、撰寫指南、常見陷阱 |
| [CHANGELOG.md](./CHANGELOG.md) | 版本更新紀錄 |


## Shipping 配送模組

詳見 [SHIPPING.md](./SHIPPING.md)：配送規則、模組介面、訂單 API 欄位、舊資料遷移與測試方式。宅配 120 元，商品滿 1,500 元免宅配基本運費；超商取貨 60 元與偏遠 200 元、急件 250 元附加費不免除。訂單總額包含運費。


## 完整測試與 Postman

`npm run test:unit` 執行 Shipping 單元測試；`npm run test:integration` 以獨立記憶體 SQLite 驗證訂單交易及付款 API；`npm run test:e2e` 對已啟動的 localhost:3001 執行綠界測試付款；`npm run postman` 更新 OpenAPI 並產生 `postman/flower-shop.postman_collection.json`。

執行前提、資料隔離、測試帳號及成功截圖位置請見 [TESTING.md](./TESTING.md)。E2E 會在已啟動網站留下測試訂單並扣庫存。
