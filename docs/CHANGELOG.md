# CHANGELOG.md

本文件記錄專案的重要變更。格式參考 [Keep a Changelog](https://keepachangelog.com/zh-TW/1.0.0/)。

---

## [1.1.1] — 2026-06-10

### 修正

**綠界金流付款後無法導回網站**
- 移除 `OrderResultURL`：綠界僅支援 port 80/443，`localhost:3001` 無法接收，且與 `ClientBackURL` 同時設定時以 `OrderResultURL` 為主，導致付款完成後卡在綠界頁面
- `ClientBackURL` 改帶 `?payment_return=1`，消費者點「返回商店」導回訂單頁後，前端自動呼叫 `POST /api/orders/:id/ecpay/verify` 以 QueryTradeInfo 確認付款結果
- `queryTradeInfo()` 新增回應 CheckMacValue 驗證，防止查詢結果遭竄改
- 移除 `app.js` 中無法被觸發的 `POST /api/orders/:id/ecpay/result` 路由

---

## [1.1.0] — 2026-04-20

### 新增

**綠界金流（ECPay AIO）**
- `POST /api/orders/:id/ecpay`：產生簽名後的 AIO 付款表單參數（含 CheckMacValue），前端可直接 POST 至綠界
- `POST /api/orders/:id/ecpay/verify`：主動呼叫綠界 QueryTradeInfo 查詢付款結果，付款成功自動將訂單改為 `paid`
- `POST /api/orders/ecpay/notify`：綠界 ReturnURL 接收端點，本地固定回傳 `1|OK`
- `src/utils/ecpay.js`：CheckMacValue 計算、AIO 參數組裝、QueryTradeInfo 查詢共用工具
- 訂單詳情頁新增「使用信用卡付款」按鈕，自動帶出 AIO 表單

---

## [1.0.0] — 2026-04-20

### 新增

**使用者認證系統**
- `POST /api/auth/register`：使用者註冊，回傳 JWT Token
- `POST /api/auth/login`：使用者登入，回傳 JWT Token
- `GET /api/auth/profile`：取得目前登入使用者資料
- JWT HS256 驗證，有效期 7 天
- bcrypt 密碼雜湊（10 rounds）

**商品瀏覽**
- `GET /api/products`：公開商品列表，支援分頁（page、limit，上限 100）
- `GET /api/products/:id`：公開商品詳情
- 預載入 8 筆花卉商品種子資料

**購物車管理**
- `GET /api/cart`：查看購物車（含商品快照與總金額）
- `POST /api/cart`：加入購物車（支援數量累加）
- `PATCH /api/cart/:itemId`：修改購物車數量
- `DELETE /api/cart/:itemId`：移除購物車項目
- 雙模式識別：JWT Bearer Token（已登入）或 `X-Session-Id` header（訪客）

**訂單管理**
- `POST /api/orders`：從購物車建立訂單（含 Transaction：扣庫存、清購物車）
- `GET /api/orders`：查詢個人訂單列表
- `GET /api/orders/:id`：查詢訂單詳情（含 order_items 快照）
- `PATCH /api/orders/:id/pay`：模擬付款（success → paid / fail → failed）
- 訂單編號格式：`ORD-YYYYMMDD-XXXXX`
- order_items 儲存商品名稱與價格快照，確保歷史訂單不受商品修改影響

**後台商品管理**（需 admin 角色）
- `GET /api/admin/products`：後台商品列表（分頁）
- `POST /api/admin/products`：新增商品
- `PUT /api/admin/products/:id`：更新商品資料
- `DELETE /api/admin/products/:id`：刪除商品（有待處理訂單時拒絕刪除）

**後台訂單管理**（需 admin 角色）
- `GET /api/admin/orders`：所有訂單列表（可依 status 篩選）
- `GET /api/admin/orders/:id`：訂單詳情（含下單使用者資訊）

**前端頁面（EJS SSR）**
- 前台：首頁、商品詳情、購物車、結帳、登入/註冊、訂單列表、訂單詳情
- 後台：商品管理、訂單管理

**基礎架構**
- SQLite 資料庫（WAL 模式、外鍵約束）
- 統一 API 回應格式（`{ data, error, message }`）
- 全局錯誤處理 middleware
- Session middleware（X-Session-Id 管理）
- CORS 設定（依 `FRONTEND_URL` 環境變數）
- OpenAPI 3.0.3 文件（透過 JSDoc 自動產生）
- Vitest 測試套件（6 個測試檔，循序執行）
- Tailwind CSS 自訂主題（花卉品牌玫瑰色系）


## 2026-09-13

- 新增獨立 Shipping 模組與配送單元/API 測試。
- 建單保存配送快照與含運費總額，支援既有資料庫遷移。
- 購物車及結帳共用配送計算，提供宅配、超商、偏遠與急件選項。
- 更新 OpenAPI 與配送文件；測試改用記憶體資料庫。


## 2026-09-13：完整測試流程

- 新增獨立 Vitest/Supertest 整合測試，逐案例回滾資料，驗證訂單原子性與綠界查詢結果。
- 新增 Playwright 信用卡、3D OTP、返回商店 paid 流程與成功截圖。
- 新增 OpenAPI 轉 Postman 產生器，JWT 自動儲存、Bearer 認證與集合變數。
- 提供 test:unit、test:integration、test:e2e、postman 指令並重寫測試文件。
