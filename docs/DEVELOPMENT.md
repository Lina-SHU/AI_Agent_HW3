# DEVELOPMENT.md

## 模組系統

專案使用 **CommonJS**（`require` / `module.exports`），非 ES Module。`package.json` 未設定 `"type": "module"`，所有 `require()` 均為同步載入。

---

## 命名規則

### 檔案命名

| 類型 | 規則 | 範例 |
|------|------|------|
| 路由檔案 | camelCase + Routes 後綴 | `authRoutes.js`、`adminProductRoutes.js` |
| Middleware 檔案 | camelCase + Middleware 後綴 | `authMiddleware.js`、`errorHandler.js` |
| 測試檔案 | camelCase，對應功能名稱 | `auth.test.js`、`adminProducts.test.js` |
| 前端頁面 JS | kebab-case | `product-detail.js`、`admin-products.js` |
| EJS 樣板 | kebab-case | `product-detail.ejs`、`order-detail.ejs` |

### 程式碼命名

| 類型 | 規則 | 範例 |
|------|------|------|
| 變數、函式 | camelCase | `getAdminToken`、`recipientName` |
| 資料庫欄位 | snake_case | `user_id`、`order_no`、`created_at` |
| API body 欄位（前後端溝通） | camelCase | `productId`、`recipientName` |
| 路由常數 | camelCase | `router`（固定名稱） |
| 錯誤碼（error 欄位） | UPPER_SNAKE_CASE | `VALIDATION_ERROR`、`NOT_FOUND` |
| 資料庫表名 | snake_case 複數 | `users`、`cart_items`、`order_items` |

---

## 環境變數

| 變數 | 必要性 | 預設值 | 用途 |
|------|--------|--------|------|
| `JWT_SECRET` | **必填** | 無（缺少則拒絕啟動） | JWT 簽章密鑰 |
| `PORT` | 可選 | `3001` | 伺服器監聽埠號 |
| `ADMIN_EMAIL` | 可選 | `admin@hexschool.com` | 種子管理員帳號 |
| `ADMIN_PASSWORD` | 可選 | `12345678` | 種子管理員密碼 |
| `BASE_URL` | 可選 | `http://localhost:3001` | 伺服器對外網址（OpenAPI 文件用） |
| `FRONTEND_URL` | 可選 | `http://localhost:3001` | CORS 允許來源 |
| `ECPAY_MERCHANT_ID` | 可選 | `3002607` | 綠界金流特店編號（測試環境預設為綠界提供的公用測試帳號） |
| `ECPAY_HASH_KEY` | 可選 | 綠界測試值 | 綠界金流 Hash Key |
| `ECPAY_HASH_IV` | 可選 | 綠界測試值 | 綠界金流 Hash IV |
| `ECPAY_ENV` | 可選 | `staging` | `production` 使用正式環境，其他值使用測試環境 |
| `ECPAY_RETURN_URL` | 可選 | `{BASE_URL}/api/orders/ecpay/notify` | 綠界付款結果 ReturnURL，本機開發無法被綠界回呼，可忽略 |

> 測試環境會覆寫 `JWT_SECRET` 為固定測試密鑰，並使用記憶體資料庫。

---

## 新增 API 端點的步驟

1. **選擇或建立路由檔案**（`src/routes/`）
   - 已登入用戶功能 → `orderRoutes.js` 或新建對應檔
   - 管理員功能 → `adminProductRoutes.js` / `adminOrderRoutes.js` 或新建

2. **套用 Middleware**
   ```javascript
   // 只需登入
   router.get('/path', authMiddleware, handler);

   // 需要管理員
   router.post('/path', authMiddleware, adminMiddleware, handler);

   // 購物車雙模式（JWT 或 Session）
   router.get('/path', dualAuth, handler);
   ```

3. **撰寫 Handler 函式**
   - 從 `src/database.js` 引入 `db`
   - 使用 `db.prepare(sql).get()` / `.all()` / `.run()` 執行查詢
   - Transaction 使用 `db.transaction(fn)()`
   - 回傳統一格式：`res.status(200).json({ data: ..., error: null, message: '...' })`
   - 錯誤時：`res.status(400).json({ data: null, error: 'ERROR_CODE', message: '...' })`

4. **在 app.js 掛載路由**（若新增路由檔）
   ```javascript
   const newRoutes = require('./src/routes/newRoutes');
   app.use('/api/new', newRoutes);
   ```

5. **撰寫 OpenAPI JSDoc 註解**（請見下方 JSDoc 格式）

6. **新增測試案例**（請見 TESTING.md）

---

## 新增 Middleware 的步驟

1. 在 `src/middleware/` 建立新檔案
2. 匯出一個 `(req, res, next) => {}` 函式
3. 在 `app.js`（全局）或特定路由（局部）引入套用
4. 若為全局 middleware，須注意**掛載順序**（目前順序：cors → json → urlencoded → session → 路由 → errorHandler）

---

## 新增資料庫欄位或表的步驟

1. 修改 `src/database.js` 中的 `CREATE TABLE IF NOT EXISTS` 陳述式
   - **注意**：`IF NOT EXISTS` 表示新增欄位不會自動 ALTER 已存在的表
   - 若需修改已存在的表，需手動執行 `ALTER TABLE ... ADD COLUMN ...` 或刪除 SQLite 檔案重建
2. 若有種子資料需求，在 `initializeDatabase()` 末尾加入 INSERT 邏輯
3. 測試環境使用記憶體資料庫，每次執行測試都從零建表，不需擔心遷移問題

---

## JSDoc / OpenAPI 註解格式

路由處理器須加上 `@openapi` JSDoc 區塊，供 `generate-openapi.js` 解析：

```javascript
/**
 * @openapi
 * /api/products:
 *   get:
 *     tags:
 *       - Products
 *     summary: 取得商品列表
 *     parameters:
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *           default: 1
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 10
 *           maximum: 100
 *     responses:
 *       200:
 *         description: 成功
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ProductListResponse'
 */
router.get('/', handler);
```

需要認證的端點須加上 security：
```javascript
 *     security:
 *       - bearerAuth: []
```

撰寫完後執行 `npm run openapi` 重新產生 `openapi.json`。

---

## 前端 CSS 修改

**只編輯 `public/css/input.css`，勿修改 `public/css/output.css`。**

主色系使用 CSS 變數定義於 `input.css`：

| 變數 | 色碼 | 用途 |
|------|------|------|
| `--color-rose-primary` | `#C4727F` | 主要按鈕、強調色 |
| `--color-rose-dark` | `#A85B67` | hover 狀態 |
| `--color-rose-light` | `#E8A5AE` | 輔助色 |
| `--color-apricot` | `#D4956A` | 次要按鈕 |
| `--color-sage` | `#7EA584` | 成功/標籤色 |
| `--color-cream` | `#FBF8F4` | 頁面背景 |
| `--color-blush` | `#FFF1EC` | 卡片背景 |
| `--color-rose-bg` | `#FDEAE4` | highlight 背景 |
| `--color-text-primary` | `#2C2A28` | 主要文字 |
| `--color-text-secondary` | `#6B6560` | 次要文字 |
| `--color-text-muted` | `#9A948E` | 提示文字 |

修改後需執行 `npm run dev:css`（開發）或 `npm run css:build`（正式）重新編譯。

---

## 計畫歸檔流程

### 計畫檔案命名格式

```
docs/plans/YYYY-MM-DD-<feature-name>.md
```

範例：`docs/plans/2026-04-20-user-wishlist.md`

### 計畫文件結構

```markdown
# [功能名稱]

## User Story
身為 [角色]，我希望 [功能]，以便 [目的]。

## Spec（規格）
- API 路由：...
- 請求格式：...
- 回應格式：...
- 業務邏輯：...
- 錯誤情境：...

## Tasks
- [ ] 新增資料庫欄位
- [ ] 實作 API 路由
- [ ] 撰寫測試
- [ ] 更新 OpenAPI 文件
```

### 功能完成後的流程

1. 將計畫檔案移至 `docs/plans/archive/`
   ```bash
   mv docs/plans/2026-04-20-user-wishlist.md docs/plans/archive/
   ```
2. 更新 `docs/FEATURES.md`：將功能狀態改為 ✅ 完成，補充行為描述
3. 更新 `docs/CHANGELOG.md`：加入版本條目


## Shipping 配送模組

詳見 [SHIPPING.md](./SHIPPING.md)：配送規則、模組介面、訂單 API 欄位、舊資料遷移與測試方式。宅配 120 元，商品滿 1,500 元免宅配基本運費；超商取貨 60 元與偏遠 200 元、急件 250 元附加費不免除。訂單總額包含運費。


## 完整測試與 Postman

`npm run test:unit` 執行 Shipping 單元測試；`npm run test:integration` 以獨立記憶體 SQLite 驗證訂單交易及付款 API；`npm run test:e2e` 對已啟動的 localhost:3001 執行綠界測試付款；`npm run postman` 更新 OpenAPI 並產生 `postman/flower-shop.postman_collection.json`。

執行前提、資料隔離、測試帳號及成功截圖位置請見 [TESTING.md](./TESTING.md)。E2E 會在已啟動網站留下測試訂單並扣庫存。
