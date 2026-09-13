# FEATURES.md

## 功能完成狀態總覽

| 功能區塊 | 狀態 | API 數量 |
|----------|------|----------|
| 使用者認證 | ✅ 完成 | 3 |
| 商品瀏覽 | ✅ 完成 | 2 |
| 購物車 | ✅ 完成 | 4 |
| 訂單管理 | ✅ 完成 | 4 |
| 後台商品管理 | ✅ 完成 | 4 |
| 後台訂單管理 | ✅ 完成 | 2 |
| 綠界金流 | ✅ 完成 | 3 |

---

## 綠界金流（ECPay AIO）

### 行為描述

整合綠界 AIO 金流（信用卡）。訂單處於 `pending` 狀態時，前端可呼叫 `POST /api/orders/:id/ecpay` 取得簽名後的表單參數，自動 POST 至綠界付款頁。

**本地端付款確認流程**：綠界僅支援 port 80/443，本地環境收不到 Server 端通知（ReturnURL）與前端導轉（OrderResultURL），因此不設定 `OrderResultURL`，消費者付款完成後在綠界結果頁點「返回商店」（`ClientBackURL` 帶 `?payment_return=1`）導回訂單頁，前端偵測到該參數即自動呼叫 `POST /api/orders/:id/ecpay/verify`，以 QueryTradeInfo 主動查詢綠界付款結果並更新訂單狀態。

**環境變數：**

| 變數名稱 | 說明 |
|----------|------|
| `ECPAY_MERCHANT_ID` | 特店編號 |
| `ECPAY_HASH_KEY` | HashKey |
| `ECPAY_HASH_IV` | HashIV |
| `ECPAY_ENV` | `production` 為正式環境，其他值使用測試環境 |
| `BASE_URL` | 本站網址（用於組 ClientBackURL） |
| `ECPAY_RETURN_URL` | 綠界付款結果通知網址（ReturnURL），預設 `{BASE_URL}/api/orders/ecpay/notify` |

### POST /api/orders/:id/ecpay — 取得 AIO 付款參數

**認證：** JWT 必填

**成功回應 200：**
```json
{
  "data": {
    "actionUrl": "https://payment-stage.ecpay.com.tw/Cashier/AioCheckOut/V5",
    "params": {
      "MerchantID": "...",
      "MerchantTradeNo": "...",
      "CheckMacValue": "...",
      "..."
    }
  },
  "error": null,
  "message": "成功"
}
```

**錯誤情境：**

| 情境 | 狀態碼 | error | message |
|------|--------|-------|---------|
| 訂單不存在或非本人 | 404 | NOT_FOUND | 訂單不存在 |
| 訂單狀態非 pending | 400 | INVALID_STATUS | 訂單狀態不是 pending，無法付款 |
| 環境變數未設定等錯誤 | 500 | ECPAY_ERROR | 錯誤訊息 |

### POST /api/orders/:id/ecpay/verify — 查詢付款結果

**認證：** JWT 必填

呼叫綠界 `QueryTradeInfo/V5` API 查詢付款狀態。若 `TradeStatus = 1`（付款成功），自動將訂單狀態改為 `paid`。若訂單已非 `pending`，直接回傳目前狀態，不再呼叫綠界。

**錯誤情境：**

| 情境 | 狀態碼 | error | message |
|------|--------|-------|---------|
| 訂單不存在或非本人 | 404 | NOT_FOUND | 訂單不存在 |
| 綠界 API 呼叫失敗 | 502 | ECPAY_QUERY_FAILED | 錯誤訊息 |

### POST /api/orders/ecpay/notify — 綠界付款結果通知接收（ReturnURL）

**認證：** 無（由綠界伺服器呼叫）

本機開發時此端點無法被綠界呼叫，僅作預留。固定回傳 `1|OK` 避免綠界持續重試。

---

## 使用者認證

### 行為描述

系統使用 JWT 做為主要身份識別機制。使用者成功登入或註冊後，伺服器回傳一個有效期 7 天的 Bearer Token，前端存入 localStorage（key: `flower_token`）。所有需要身份的請求皆須在 `Authorization: Bearer <token>` header 帶上此 Token。Token 不支援刷新，過期後需重新登入。

### POST /api/auth/register — 註冊

**請求 body（必填）：**

| 欄位 | 型別 | 規則 |
|------|------|------|
| email | string | 必填，格式符合 `[^\s@]+@[^\s@]+\.[^\s@]+` |
| password | string | 必填，最少 6 個字元 |
| name | string | 必填 |

**業務邏輯：**
1. 驗證欄位格式
2. 查詢 email 是否已存在（`UNIQUE` 約束）
3. `bcrypt.hashSync(password, 10)` 產生密碼雜湊
4. 插入 users 表，role 固定為 `'user'`（無法自行設定為 admin）
5. 簽發 JWT，payload 含 `userId`、`email`、`role`

**成功回應 201：**
```json
{
  "data": {
    "user": { "id": "uuid", "email": "user@example.com", "name": "小花", "role": "user" },
    "token": "eyJ..."
  },
  "error": null,
  "message": "註冊成功"
}
```

**錯誤情境：**

| 情境 | 狀態碼 | error | message |
|------|--------|-------|---------|
| 任一必填欄位缺少 | 400 | VALIDATION_ERROR | email、password、name 為必填欄位 |
| email 格式錯誤 | 400 | VALIDATION_ERROR | Email 格式不正確 |
| 密碼少於 6 字元 | 400 | VALIDATION_ERROR | 密碼至少需要 6 個字元 |
| email 已被使用 | 409 | CONFLICT | Email 已被註冊 |

### POST /api/auth/login — 登入

**請求 body（必填）：**

| 欄位 | 型別 |
|------|------|
| email | string |
| password | string |

**業務邏輯：**
1. 查詢使用者（WHERE email = ?）
2. `bcrypt.compareSync(password, password_hash)` 驗證密碼
3. 成功則簽發 JWT

**錯誤情境：**

| 情境 | 狀態碼 | error | message |
|------|--------|-------|---------|
| 任一欄位缺少 | 400 | VALIDATION_ERROR | email 和 password 為必填欄位 |
| email 不存在或密碼錯誤 | 401 | UNAUTHORIZED | Email 或密碼錯誤 |

（刻意不區分 email 不存在與密碼錯誤，防止帳號列舉攻擊）

### GET /api/auth/profile — 取得個人資料

**認證：** JWT 必填

**回應 data 欄位：** `id`、`email`、`name`、`role`、`created_at`

**錯誤情境：**

| 情境 | 狀態碼 | error | message |
|------|--------|-------|---------|
| 無 token | 401 | UNAUTHORIZED | 請先登入 |
| token 無效或過期 | 401 | UNAUTHORIZED | Token 無效或已過期 |
| 使用者已被刪除 | 401 | UNAUTHORIZED | 使用者不存在，請重新登入 |

---

## 商品瀏覽

### 行為描述

商品列表與詳情均為公開路由，無需任何身份驗證。列表支援分頁，預設每頁 10 筆，按 `created_at DESC` 排序。

### GET /api/products — 商品列表

**Query 參數：**

| 參數 | 型別 | 預設值 | 上限 | 說明 |
|------|------|--------|------|------|
| page | integer | 1 | — | 頁碼 |
| limit | integer | 10 | 100 | 每頁筆數 |

**回應 data 結構：**
```json
{
  "products": [
    {
      "id": "uuid",
      "name": "粉色玫瑰花束",
      "description": "浪漫粉色玫瑰，適合各種場合",
      "price": 1680,
      "stock": 30,
      "image_url": "https://...",
      "created_at": "2026-04-20T00:00:00",
      "updated_at": "2026-04-20T00:00:00"
    }
  ],
  "pagination": {
    "total": 8,
    "page": 1,
    "limit": 10,
    "totalPages": 1
  }
}
```

**種子商品（共 8 筆）：**

| 商品名稱 | 售價 | 庫存 |
|----------|------|------|
| 粉色玫瑰花束 | 1,680 | 30 |
| 白色百合花束 | 1,450 | 25 |
| 向日葵花束 | 1,280 | 40 |
| 薰衣草花束 | 1,180 | 35 |
| 混色鬱金香 | 1,380 | 20 |
| 紫色繡球花 | 1,980 | 15 |
| 橙色非洲菊 | 980 | 50 |
| 粉白混搭花束 | 2,280 | 10 |

### GET /api/products/:id — 商品詳情

**錯誤情境：**

| 情境 | 狀態碼 | error | message |
|------|--------|-------|---------|
| id 不存在 | 404 | NOT_FOUND | 商品不存在 |

---

## 購物車

### 行為描述

購物車支援**雙模式識別**：已登入使用者以 JWT Bearer Token 識別（資料儲存於 `cart_items.user_id`），未登入訪客以 `X-Session-Id` header 識別（儲存於 `cart_items.session_id`）。兩種模式的資料彼此隔離，系統目前不提供合併機制（登入後訪客購物車不會自動合併）。

**加入購物車的累加行為：** 若同一商品已在購物車中，POST /api/cart 不會新增一筆，而是將數量相加。累加後的數量若超過庫存則回傳 400。

### GET /api/cart — 查看購物車

**認證：** JWT 或 Session

**回應 data 結構：**
```json
{
  "items": [
    {
      "id": "cart-item-uuid",
      "product_id": "product-uuid",
      "quantity": 3,
      "product": {
        "name": "粉色玫瑰花束",
        "price": 1680,
        "stock": 30,
        "image_url": "https://..."
      }
    }
  ],
  "total": 5040
}
```

`total` 為所有品項的 `price × quantity` 合計。

### POST /api/cart — 加入購物車

**認證：** JWT 或 Session

**請求 body：**

| 欄位 | 型別 | 必填 | 預設 | 說明 |
|------|------|------|------|------|
| productId | string | 是 | — | 商品 UUID |
| quantity | integer | 否 | 1 | 加入數量，最小值 1 |

**業務邏輯（累加邏輯）：**
```
已有相同商品 → 新數量 = 原數量 + 傳入 quantity
沒有相同商品 → 新增一筆，數量 = 傳入 quantity
超過庫存 → 400 STOCK_INSUFFICIENT
```

**錯誤情境：**

| 情境 | 狀態碼 | error | message |
|------|--------|-------|---------|
| productId 未填 | 400 | VALIDATION_ERROR | productId 為必填欄位 |
| quantity 非正整數 | 400 | VALIDATION_ERROR | quantity 必須為正整數 |
| 商品不存在 | 404 | NOT_FOUND | 商品不存在 |
| 超過庫存 | 400 | STOCK_INSUFFICIENT | 庫存不足 |
| 無 token 且無 session | 401 | UNAUTHORIZED | 請先登入 |

### PATCH /api/cart/:itemId — 修改數量

**認證：** JWT 或 Session

**請求 body：**

| 欄位 | 型別 | 必填 | 說明 |
|------|------|------|------|
| quantity | integer | 是 | 新數量（替換，非累加），最小值 1 |

此端點為**替換**而非累加，直接將數量設定為傳入值。

**錯誤情境：**

| 情境 | 狀態碼 | error | message |
|------|--------|-------|---------|
| 購物車項目不存在或不屬於此使用者 | 404 | NOT_FOUND | 購物車項目不存在 |
| 超過庫存 | 400 | STOCK_INSUFFICIENT | 庫存不足 |

### DELETE /api/cart/:itemId — 移除項目

**認證：** JWT 或 Session

**錯誤情境：**

| 情境 | 狀態碼 | error | message |
|------|--------|-------|---------|
| 購物車項目不存在或不屬於此使用者 | 404 | NOT_FOUND | 購物車項目不存在 |

---

## 訂單管理

### 行為描述

訂單操作需要 JWT 登入，不支援訪客建立訂單。建立訂單時，系統從 `cart_items`（user_id 模式）讀取資料，並在同一個 SQLite Transaction 中完成：建立訂單、建立訂單明細（商品快照）、扣除庫存、清空購物車四個步驟，任何步驟失敗均 ROLLBACK。

訂單一旦建立，狀態為 `pending`。透過 PATCH /api/orders/:id/pay 可模擬付款，帶入 `action: "success"` 改為 `paid`，`action: "fail"` 改為 `failed`。已非 `pending` 的訂單無法再次付款。

### POST /api/orders — 建立訂單

**認證：** JWT 必填

**請求 body：**

| 欄位 | 型別 | 必填 | 說明 |
|------|------|------|------|
| recipientName | string | 是 | 收件人姓名 |
| recipientEmail | string | 是 | 收件人 Email（格式驗證） |
| recipientAddress | string | 是 | 收件地址 |

**訂單編號格式：** `ORD-YYYYMMDD-XXXXX`（例：`ORD-20260420-A1B2C`）

**回應 data 結構（201）：**
```json
{
  "id": "order-uuid",
  "order_no": "ORD-20260420-A1B2C",
  "total_amount": 3360,
  "status": "pending",
  "items": [
    {
      "product_name": "粉色玫瑰花束",
      "product_price": 1680,
      "quantity": 2
    }
  ],
  "created_at": "2026-04-20T..."
}
```

**錯誤情境：**

| 情境 | 狀態碼 | error | message |
|------|--------|-------|---------|
| 必填欄位缺少 | 400 | VALIDATION_ERROR | 收件人姓名、Email 和地址為必填欄位 |
| Email 格式錯誤 | 400 | VALIDATION_ERROR | Email 格式不正確 |
| 購物車為空 | 400 | CART_EMPTY | 購物車為空 |
| 商品庫存不足 | 400 | STOCK_INSUFFICIENT | 以下商品庫存不足：{商品名稱} |
| 無 token | 401 | UNAUTHORIZED | 請先登入 |

### GET /api/orders — 我的訂單列表

**認證：** JWT 必填

僅回傳目前登入使用者的訂單，依 `created_at DESC` 排序。

**回應 data.orders 欄位：** `id`、`order_no`、`subtotal`、`shipping_fee`、`shipping_method`、`is_remote`、`is_express`、`total_amount`、`status`、`created_at`

### GET /api/orders/:id — 訂單詳情

**認證：** JWT 必填

回傳訂單完整資訊，包含 `items` 陣列（訂單明細快照）。系統以 `user_id` 做隔離，使用者只能查看自己的訂單。

**錯誤情境：**

| 情境 | 狀態碼 | error | message |
|------|--------|-------|---------|
| 訂單不存在或非本人 | 404 | NOT_FOUND | 訂單不存在 |

### PATCH /api/orders/:id/pay — 模擬付款

**認證：** JWT 必填

**請求 body：**

| 欄位 | 型別 | 必填 | 說明 |
|------|------|------|------|
| action | string | 是 | `"success"` 或 `"fail"` |

**狀態對應：**

| action | 新狀態 | 訊息 |
|--------|--------|------|
| success | paid | 付款成功 |
| fail | failed | 付款失敗 |

**錯誤情境：**

| 情境 | 狀態碼 | error | message |
|------|--------|-------|---------|
| action 值非法 | 400 | VALIDATION_ERROR | action 必須為 success 或 fail |
| 訂單狀態非 pending | 400 | INVALID_STATUS | 訂單狀態不是 pending，無法付款 |
| 訂單不存在或非本人 | 404 | NOT_FOUND | 訂單不存在 |

---

## 後台商品管理

### 行為描述

所有後台商品 API 需同時具備有效 JWT Token 且 `role = 'admin'`。非管理員帳號一律回傳 403。商品更新支援部分欄位更新（PUT 語義為全量，但系統實作為只更新有提供的欄位）。

### GET /api/admin/products — 後台商品列表

**認證：** JWT + admin role

**Query 參數：** 同 `/api/products`（page、limit，上限 100）

**回應格式：** 同 `/api/products`，包含完整分頁資訊。

### POST /api/admin/products — 新增商品

**認證：** JWT + admin role

**請求 body：**

| 欄位 | 型別 | 必填 | 驗證規則 |
|------|------|------|----------|
| name | string | 是 | 非空字串 |
| description | string | 否 | 任意字串 |
| price | integer | 是 | 正整數（> 0） |
| stock | integer | 是 | 非負整數（>= 0） |
| image_url | string | 否 | 任意字串 |

**錯誤情境：**

| 情境 | 狀態碼 | error | message |
|------|--------|-------|---------|
| name 未填 | 400 | VALIDATION_ERROR | name 為必填欄位 |
| price 非正整數 | 400 | VALIDATION_ERROR | price 必須為正整數 |
| stock 為負數 | 400 | VALIDATION_ERROR | stock 必須為非負整數 |

### PUT /api/admin/products/:id — 更新商品

**認證：** JWT + admin role

**請求 body：** 與新增商品相同，所有欄位皆為選填（只更新有提供的欄位）。

更新成功後 `updated_at` 自動設為 `datetime('now')`。

**錯誤情境：**

| 情境 | 狀態碼 | error | message |
|------|--------|-------|---------|
| 商品不存在 | 404 | NOT_FOUND | 商品不存在 |
| price/stock 驗證失敗 | 400 | VALIDATION_ERROR | 同新增商品 |

### DELETE /api/admin/products/:id — 刪除商品

**認證：** JWT + admin role

**業務邏輯：** 刪除前檢查是否有 `status = 'pending'` 的訂單包含此商品（透過 order_items JOIN orders 查詢）。若有，拒絕刪除。

**錯誤情境：**

| 情境 | 狀態碼 | error | message |
|------|--------|-------|---------|
| 商品不存在 | 404 | NOT_FOUND | 商品不存在 |
| 有待處理訂單 | 409 | CONFLICT | 此商品存在未完成的訂單，無法刪除 |

---

## 後台訂單管理

### 行為描述

後台可查看所有使用者的訂單（不限於自己），並可透過 `status` 參數篩選。訂單詳情除訂單資訊外，還包含下單使用者的姓名與 Email，方便客服作業。管理員目前無法從後台直接變更訂單狀態，付款狀態變更需透過使用者端的 `PATCH /api/orders/:id/pay`。

### GET /api/admin/orders — 後台訂單列表

**認證：** JWT + admin role

**Query 參數：**

| 參數 | 型別 | 必填 | 說明 |
|------|------|------|------|
| page | integer | 否（預設 1） | 頁碼 |
| limit | integer | 否（預設 10，上限 100） | 每頁筆數 |
| status | string | 否 | 篩選狀態：`pending`、`paid`、`failed` |

傳入非法 status 值時，篩選條件被忽略（回傳全部）。

**回應 data 結構：**
```json
{
  "orders": [
    {
      "id": "uuid",
      "order_no": "ORD-...",
      "user_id": "uuid",
      "recipient_name": "小花",
      "recipient_email": "user@example.com",
      "recipient_address": "台北市...",
      "total_amount": 1680,
      "status": "pending",
      "created_at": "2026-04-20T..."
    }
  ],
  "pagination": { "total", "page", "limit", "totalPages" }
}
```

### GET /api/admin/orders/:id — 後台訂單詳情

**認證：** JWT + admin role

除訂單基本資料外，回傳 `items`（訂單明細）與 `user`（下單者資訊）：

```json
{
  "...訂單欄位...",
  "items": [ { "product_name", "product_price", "quantity", ... } ],
  "user": {
    "name": "小花",
    "email": "user@example.com"
  }
}
```

**錯誤情境：**

| 情境 | 狀態碼 | error | message |
|------|--------|-------|---------|
| 訂單不存在 | 404 | NOT_FOUND | 訂單不存在 |


## Shipping 配送模組

詳見 [SHIPPING.md](./SHIPPING.md)：配送規則、模組介面、訂單 API 欄位、舊資料遷移與測試方式。宅配 120 元，商品滿 1,500 元免宅配基本運費；超商取貨 60 元與偏遠 200 元、急件 250 元附加費不免除。訂單總額包含運費。
