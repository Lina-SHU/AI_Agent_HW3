# ARCHITECTURE.md

## 目錄結構

```
project-root/
├── server.js                  # 進入點：驗證 JWT_SECRET、監聽 port
├── app.js                     # Express 應用設定：middleware 堆疊、路由掛載
├── swagger-config.js          # OpenAPI 3.0.3 規格設定（server、securitySchemes）
├── generate-openapi.js        # 讀取 routes/*.js JSDoc 產生 openapi.json
├── vitest.config.js           # 測試設定（循序、逾時、檔案順序）
├── .env                       # 環境變數（含金流設定範例）
│
├── src/
│   ├── database.js            # SQLite 初始化、建表、種子資料、匯出 db 實例
│   ├── middleware/
│   │   ├── authMiddleware.js  # JWT 驗證，附加 req.user
│   │   ├── adminMiddleware.js # 檢查 req.user.role === 'admin'
│   │   ├── sessionMiddleware.js # 從 X-Session-Id header 讀取，附加 req.sessionId
│   │   └── errorHandler.js   # 全局錯誤捕捉，統一 500 格式
│   ├── routes/
│   │   ├── authRoutes.js      # POST /register, POST /login, GET /profile
│   │   ├── productRoutes.js   # GET /products, GET /products/:id（公開）
│   │   ├── cartRoutes.js      # 購物車 CRUD（dualAuth：JWT 或 session）
│   │   ├── orderRoutes.js     # 建立/查詢訂單、模擬付款、綠界金流（需登入）
│   │   ├── adminProductRoutes.js # 後台商品 CRUD（需 admin）
│   │   ├── adminOrderRoutes.js   # 後台訂單查詢（需 admin）
│   │   └── pageRoutes.js      # SSR 頁面路由，渲染 EJS 模板
│   └── utils/
│       └── ecpay.js           # 綠界金流：CheckMacValue 計算、AIO 參數組裝、QueryTradeInfo 查詢
│
├── views/
│   ├── layouts/
│   │   ├── front.ejs          # 前台佈局（含 header、footer、Tailwind）
│   │   └── admin.ejs          # 後台佈局（側邊欄導覽）
│   ├── pages/
│   │   ├── index.ejs          # 商品列表首頁
│   │   ├── product-detail.ejs # 商品詳情頁
│   │   ├── cart.ejs           # 購物車頁
│   │   ├── checkout.ejs       # 結帳頁
│   │   ├── login.ejs          # 登入/註冊頁
│   │   ├── orders.ejs         # 我的訂單列表頁
│   │   ├── order-detail.ejs   # 訂單詳情頁
│   │   └── admin/
│   │       ├── products.ejs   # 後台商品管理頁
│   │       └── orders.ejs     # 後台訂單管理頁
│   └── partials/              # 共用元件（header、footer、notification 等）
│
├── public/
│   ├── css/
│   │   ├── input.css          # Tailwind 設定（含自訂 CSS 變數主色系）
│   │   └── output.css         # 自動產生，勿直接修改
│   └── js/
│       ├── api.js             # 共用 apiFetch 封裝（自動帶 token，401 重導向）
│       ├── auth.js            # Auth 物件（token/session 的讀寫、登入登出）
│       ├── header-init.js     # DOMContentLoaded：更新導覽列狀態與購物車 badge
│       ├── notification.js    # 顯示 toast 通知的工具函式
│       └── pages/             # 各頁面專屬 JS（index、cart、checkout 等）
│
├── tests/
│   ├── setup.js               # getAdminToken()、registerUser() 輔助函式
│   ├── auth.test.js
│   ├── products.test.js
│   ├── cart.test.js
│   ├── orders.test.js
│   ├── adminProducts.test.js
│   └── adminOrders.test.js
│
└── docs/
    ├── plans/                 # 進行中的功能計畫
    └── plans/archive/         # 已完成計畫歸檔
```

---

## 啟動流程

```
server.js
  │
  ├── 1. 載入 dotenv（.env → process.env）
  ├── 2. 檢查 JWT_SECRET 是否存在，缺少則 process.exit(1)
  ├── 3. import app from './app.js'
  │       ├── cors()              origin = FRONTEND_URL || 'http://localhost:3001'
  │       ├── express.json()
  │       ├── express.urlencoded({ extended: false })
  │       ├── sessionMiddleware    req.sessionId = X-Session-Id header 或 null
  │       ├── 掛載 API 路由
  │       │   ├── /api/auth      → authRoutes
  │       │   ├── /api/products  → productRoutes
  │       │   ├── /api/cart      → cartRoutes
  │       │   ├── POST /api/orders/ecpay/notify → 綠界付款通知（固定回傳 1|OK，須掛在 orderRoutes 之前）
  │       │   ├── /api/orders    → orderRoutes
  │       │   ├── /api/admin/products → adminProductRoutes
  │       │   └── /api/admin/orders   → adminOrderRoutes
  │       ├── 掛載 pageRoutes（SSR 頁面，無前綴）
  │       ├── 404 handler
  │       └── errorHandler（4 參數，全局 catch）
  │
  ├── 4. import db from './src/database.js'（模組載入時自動執行）
  │       ├── 開啟 SQLite 檔案（測試環境為 :memory:）
  │       ├── PRAGMA journal_mode = WAL
  │       ├── PRAGMA foreign_keys = ON
  │       ├── CREATE TABLE IF NOT EXISTS（users、products、cart_items、orders、order_items）
  │       └── 種子資料：8 個花卉商品 + 1 位管理員（若不存在）
  │
  └── 5. app.listen(PORT)  （PORT = process.env.PORT || 3001）
```

---

## API 路由總覽

| HTTP | 路徑 | 檔案 | 認證 | 說明 |
|------|------|------|------|------|
| POST | /api/auth/register | authRoutes.js | 無 | 註冊新帳號 |
| POST | /api/auth/login | authRoutes.js | 無 | 使用者登入 |
| GET | /api/auth/profile | authRoutes.js | JWT | 取得目前使用者資料 |
| GET | /api/products | productRoutes.js | 無 | 商品列表（分頁） |
| GET | /api/products/:id | productRoutes.js | 無 | 商品詳情 |
| GET | /api/cart | cartRoutes.js | JWT 或 Session | 查看購物車 |
| POST | /api/cart | cartRoutes.js | JWT 或 Session | 加入/累加購物車 |
| PATCH | /api/cart/:itemId | cartRoutes.js | JWT 或 Session | 修改購物車數量 |
| DELETE | /api/cart/:itemId | cartRoutes.js | JWT 或 Session | 移除購物車項目 |
| POST | /api/orders | orderRoutes.js | JWT | 建立訂單 |
| GET | /api/orders | orderRoutes.js | JWT | 我的訂單列表 |
| GET | /api/orders/:id | orderRoutes.js | JWT | 訂單詳情 |
| PATCH | /api/orders/:id/pay | orderRoutes.js | JWT | 模擬付款（success/fail） |
| POST | /api/orders/:id/ecpay | orderRoutes.js | JWT | 取得綠界 AIO 付款表單參數 |
| POST | /api/orders/:id/ecpay/verify | orderRoutes.js | JWT | 主動查詢綠界付款結果，成功則改為 paid |
| POST | /api/orders/ecpay/notify | app.js | 無 | 綠界 ReturnURL 通知接收（固定回 1\|OK） |
| GET | /api/admin/products | adminProductRoutes.js | JWT + admin | 後台商品列表 |
| POST | /api/admin/products | adminProductRoutes.js | JWT + admin | 新增商品 |
| PUT | /api/admin/products/:id | adminProductRoutes.js | JWT + admin | 更新商品 |
| DELETE | /api/admin/products/:id | adminProductRoutes.js | JWT + admin | 刪除商品 |
| GET | /api/admin/orders | adminOrderRoutes.js | JWT + admin | 後台訂單列表（可篩選） |
| GET | /api/admin/orders/:id | adminOrderRoutes.js | JWT + admin | 後台訂單詳情（含使用者） |

### SSR 頁面路由

| HTTP | 路徑 | 模板 | 說明 |
|------|------|------|------|
| GET | / | pages/index | 商品列表首頁 |
| GET | /products/:id | pages/product-detail | 商品詳情頁 |
| GET | /cart | pages/cart | 購物車 |
| GET | /checkout | pages/checkout | 結帳頁 |
| GET | /login | pages/login | 登入/註冊頁 |
| GET | /orders | pages/orders | 我的訂單列表 |
| GET | /orders/:id | pages/order-detail | 訂單詳情 |
| GET | /admin/products | pages/admin/products | 後台商品管理 |
| GET | /admin/orders | pages/admin/orders | 後台訂單管理 |

---

## 統一回應格式

所有 API 端點一律回傳以下結構：

```json
{
  "data": { ... } | null,
  "error": "ERROR_CODE" | null,
  "message": "人類可讀的訊息"
}
```

**成功範例：**
```json
{
  "data": {
    "user": { "id": "uuid", "email": "user@example.com", "name": "小花", "role": "user" },
    "token": "eyJ0eXAiOiJKV1QiLCJhbGciOiJIUzI1NiJ9..."
  },
  "error": null,
  "message": "登入成功"
}
```

**失敗範例：**
```json
{
  "data": null,
  "error": "VALIDATION_ERROR",
  "message": "密碼至少需要 6 個字元"
}
```

**常見錯誤碼（error 欄位）：**

| 錯誤碼 | HTTP 狀態 | 含義 |
|--------|----------|------|
| `VALIDATION_ERROR` | 400 | 輸入格式或必填欄位錯誤 |
| `UNAUTHORIZED` | 401 | 未提供或無效的 token |
| `FORBIDDEN` | 403 | 權限不足（非管理員） |
| `NOT_FOUND` | 404 | 資源不存在 |
| `CONFLICT` | 409 | 資源衝突（如 email 重複、刪除有訂單的商品） |
| `CART_EMPTY` | 400 | 購物車為空，無法建立訂單 |
| `STOCK_INSUFFICIENT` | 400 | 庫存不足 |
| `INVALID_STATUS` | 400 | 訂單狀態不允許此操作 |
| `ECPAY_ERROR` | 500 | 綠界 AIO 參數組裝失敗（通常為環境變數未設定） |
| `ECPAY_QUERY_FAILED` | 502 | 呼叫綠界 QueryTradeInfo API 失敗 |

---

## 認證與授權機制

### JWT 驗證（authMiddleware.js）

1. 讀取 `req.headers.authorization`，格式須為 `Bearer <token>`
2. 呼叫 `jwt.verify(token, JWT_SECRET, { algorithms: ['HS256'] })`
3. 從資料庫查詢使用者是否仍存在（防止帳號被刪除後 token 仍有效）
4. 成功則設定 `req.user = { userId, email, role }`

**JWT 參數：**

| 參數 | 值 |
|------|----|
| 演算法 | HS256 |
| 有效期 | 7 天（`expiresIn: '7d'`） |
| Payload 欄位 | `userId`、`email`、`role` |
| 密鑰環境變數 | `JWT_SECRET` |

### 購物車雙模式認證（dualAuth，定義於 cartRoutes.js）

購物車支援未登入訪客，識別邏輯如下：

```
Request 進入
  │
  ├── Authorization: Bearer <token> 存在？
  │     └── YES → 走 authMiddleware，設定 req.user
  │                 購物車查詢條件：WHERE user_id = req.user.userId
  │
  └── NO → 讀取 X-Session-Id header（由 sessionMiddleware 設定至 req.sessionId）
              └── Session ID 存在？
                    ├── YES → 購物車查詢條件：WHERE session_id = req.sessionId
                    └── NO → 回傳 401 UNAUTHORIZED
```

前端 `Auth.getSessionId()` 會自動產生並儲存 UUID 至 localStorage，每次 API 請求透過 `Auth.getAuthHeaders()` 自動帶上 `X-Session-Id`。

### 管理員授權（adminMiddleware.js）

- 必須先通過 authMiddleware
- 檢查 `req.user.role === 'admin'`，否則回傳 403

---

## 資料庫 Schema

### users 表

| 欄位 | 型別 | 約束 | 說明 |
|------|------|------|------|
| id | TEXT | PRIMARY KEY | UUID |
| email | TEXT | UNIQUE NOT NULL | 登入帳號 |
| password_hash | TEXT | NOT NULL | bcrypt 雜湊 |
| name | TEXT | NOT NULL | 顯示名稱 |
| role | TEXT | NOT NULL DEFAULT 'user' CHECK IN ('user','admin') | 角色 |
| created_at | TEXT | NOT NULL DEFAULT datetime('now') | 建立時間 |

### products 表

| 欄位 | 型別 | 約束 | 說明 |
|------|------|------|------|
| id | TEXT | PRIMARY KEY | UUID |
| name | TEXT | NOT NULL | 商品名稱 |
| description | TEXT | | 商品描述（可為 NULL） |
| price | INTEGER | NOT NULL CHECK(price > 0) | 售價（元） |
| stock | INTEGER | NOT NULL DEFAULT 0 CHECK(stock >= 0) | 庫存數量 |
| image_url | TEXT | | 圖片網址（可為 NULL） |
| created_at | TEXT | NOT NULL DEFAULT datetime('now') | 建立時間 |
| updated_at | TEXT | NOT NULL DEFAULT datetime('now') | 更新時間 |

### cart_items 表

| 欄位 | 型別 | 約束 | 說明 |
|------|------|------|------|
| id | TEXT | PRIMARY KEY | UUID |
| session_id | TEXT | | 訪客識別碼（未登入時使用） |
| user_id | TEXT | FOREIGN KEY → users(id) | 登入使用者 ID |
| product_id | TEXT | NOT NULL FOREIGN KEY → products(id) | 商品 ID |
| quantity | INTEGER | NOT NULL DEFAULT 1 CHECK(quantity > 0) | 數量 |

> `session_id` 與 `user_id` 擇一使用，不會同時存在。

### orders 表

| 欄位 | 型別 | 約束 | 說明 |
|------|------|------|------|
| id | TEXT | PRIMARY KEY | UUID |
| order_no | TEXT | UNIQUE NOT NULL | 訂單編號（格式：ORD-YYYYMMDD-XXXXX） |
| user_id | TEXT | NOT NULL FOREIGN KEY → users(id) | 下單使用者 |
| recipient_name | TEXT | NOT NULL | 收件人姓名 |
| recipient_email | TEXT | NOT NULL | 收件人 Email |
| recipient_address | TEXT | NOT NULL | 收件地址 |
| subtotal | INTEGER | NOT NULL DEFAULT 0 | 商品小計快照（元） |
| shipping_fee | INTEGER | NOT NULL DEFAULT 0 | 含附加費運費快照（元） |
| shipping_method | TEXT | NOT NULL DEFAULT home | home 或 convenience_store |
| is_remote | INTEGER | NOT NULL DEFAULT 0 | 偏遠地區（0 / 1） |
| is_express | INTEGER | NOT NULL DEFAULT 0 | 當日急件（0 / 1） |
| total_amount | INTEGER | NOT NULL | 商品小計加運費（元） |
| status | TEXT | NOT NULL DEFAULT 'pending' CHECK IN ('pending','paid','failed') | 訂單狀態 |
| created_at | TEXT | NOT NULL DEFAULT datetime('now') | 建立時間 |

### order_items 表

| 欄位 | 型別 | 約束 | 說明 |
|------|------|------|------|
| id | TEXT | PRIMARY KEY | UUID |
| order_id | TEXT | NOT NULL FOREIGN KEY → orders(id) | 所屬訂單 |
| product_id | TEXT | NOT NULL | 商品 ID（僅供參考，不設外鍵） |
| product_name | TEXT | NOT NULL | 商品名稱快照 |
| product_price | INTEGER | NOT NULL | 商品單價快照 |
| quantity | INTEGER | NOT NULL | 購買數量 |

> `product_name` 和 `product_price` 是建單當下的快照，不隨商品修改而更新，確保歷史訂單資料正確性。

---

## 資料流

### 建立訂單流程（Transaction）

```
POST /api/orders
  │
  ├── 1. 驗證 recipientName、recipientEmail、recipientAddress 非空
  ├── 2. SELECT cart_items JOIN products WHERE user_id = req.user.userId
  ├── 3. 購物車為空 → 400 CART_EMPTY
  ├── 4. 逐項檢查 quantity <= product.stock（不足 → 400 STOCK_INSUFFICIENT）
  ├── 5. subtotal = SUM(price * quantity)，Shipping 計算 shipping_fee；total_amount = subtotal + shipping_fee
  │
  └── 6. BEGIN TRANSACTION
          ├── INSERT INTO orders（含 order_no = ORD-YYYYMMDD-XXXXX）
          ├── FOR EACH cart_item:
          │     ├── INSERT INTO order_items（product_name、product_price 為快照）
          │     └── UPDATE products SET stock = stock - quantity
          └── DELETE FROM cart_items WHERE user_id = req.user.userId
         COMMIT（任何步驟失敗則 ROLLBACK）
```

### 購物車累加流程

```
POST /api/cart { productId, quantity }
  │
  ├── 驗證商品存在
  ├── SELECT FROM cart_items WHERE product_id = ? AND (user_id OR session_id)
  │
  ├── 已存在？
  │     ├── newQty = 現有 quantity + 傳入 quantity
  │     ├── newQty > product.stock → 400 STOCK_INSUFFICIENT
  │     └── UPDATE cart_items SET quantity = newQty
  │
  └── 不存在？
        ├── quantity > product.stock → 400 STOCK_INSUFFICIENT
        └── INSERT INTO cart_items
```

### 前端認證流程

```
使用者操作（呼叫 apiFetch）
  │
  ├── Auth.getAuthHeaders() 附加：
  │     ├── Authorization: Bearer <token>（若已登入）
  │     └── X-Session-Id: <uuid>（永遠附加）
  │
  ├── 伺服器回傳 401？
  │     └── Auth.logout()（清除 localStorage）→ 重導向 /login
  │
  └── 成功 → 處理回應
```

---

## 金流整合

系統同時支援兩種付款路徑：

### 1. 模擬付款（`PATCH /api/orders/:id/pay`）
前端傳入 `action: "success"` 或 `action: "fail"` 直接更新訂單狀態，無需呼叫外部 API，適合開發與測試使用。

### 2. 綠界 AIO 金流（`src/utils/ecpay.js`）
透過綠界 AIO CheckOut V5 進行信用卡付款，完整流程如下：

```
前端呼叫 POST /api/orders/:id/ecpay
  │
  ├── 1. orderRoutes 驗證訂單屬於目前使用者且狀態為 pending
  ├── 2. 呼叫 buildAioParams()：
  │       ├── 組裝 AIO 必要欄位（MerchantTradeNo、TotalAmount、ItemName...）
  │       ├── 排序參數、URL encode、計算 SHA256 CheckMacValue
  │       └── 回傳 { actionUrl, params }
  ├── 3. 前端以隱藏表單 POST 至 actionUrl（綠界付款頁）
  │
  └── 付款後：
        ├── 綠界伺服器 POST /api/orders/ecpay/notify（ReturnURL）
        │     └── 綠界僅支援 port 80/443，本機（localhost:3001）收不到，固定回 1|OK 僅作預留
        ├── 消費者點選綠界結果頁的「返回商店」（ClientBackURL）
        │     └── 導回 /orders/:id?payment_return=1
        └── 前端偵測到 payment_return=1 且訂單為 pending，自動呼叫 POST /api/orders/:id/ecpay/verify
              ├── queryTradeInfo()：呼叫綠界 QueryTradeInfo/V5，並驗證回應 CheckMacValue
              └── TradeStatus = 1 → 更新訂單狀態為 paid
```

> **本地端限制**：綠界的 ReturnURL（Server 端通知）與 OrderResultURL（前端導轉）僅支援 port 80/443，
> 本地開發環境無法接收，因此**不設定 OrderResultURL**（與 ClientBackURL 同時設定時以 OrderResultURL
> 為主，設了會蓋掉導回路徑），付款結果一律由本地端主動呼叫 QueryTradeInfo 查詢確認。

**CheckMacValue 計算規則（`ecpay.js`）：**
1. 過濾掉 `CheckMacValue` 本身
2. 按參數名稱字母順序排序
3. 組成 `HashKey=xxx&k1=v1&...&HashIV=xxx`
4. 進行 ECPay 規格的 URL Encode（小寫、特殊字元替換）
5. SHA256 雜湊後轉大寫十六進位

**`MerchantTradeNo` 生成規則：** 將訂單 UUID 去掉 `-` 後取前 20 碼（綠界限制最長 20 字元）。


## Shipping 配送模組

詳見 [SHIPPING.md](./SHIPPING.md)：配送規則、模組介面、訂單 API 欄位、舊資料遷移與測試方式。宅配 120 元，商品滿 1,500 元免宅配基本運費；超商取貨 60 元與偏遠 200 元、急件 250 元附加費不免除。訂單總額包含運費。
