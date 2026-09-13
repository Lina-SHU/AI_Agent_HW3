# 綠界 AIO 金流整合

## User Story

身為消費者，我希望可以使用信用卡透過綠界金流完成付款，以便完成真實交易而非依賴模擬付款。

## Spec

**新增 API：**

| 路由 | 說明 |
|------|------|
| `POST /api/orders/:id/ecpay` | 組裝 AIO 付款表單參數（含 CheckMacValue），前端以表單 POST 至綠界 |
| `POST /api/orders/:id/ecpay/verify` | 主動呼叫綠界 QueryTradeInfo/V5 查詢付款結果，成功則更新訂單為 paid |
| `POST /api/orders/ecpay/notify` | 綠界 ReturnURL 接收點，固定回傳 `1\|OK` |

**新增工具模組：** `src/utils/ecpay.js`
- `generateCheckMacValue(params, hashKey, hashIv)` — SHA256 CheckMacValue 計算
- `buildAioParams({ orderId, totalAmount, items })` — 組裝 AIO CheckOut V5 表單參數
- `queryTradeInfo(merchantTradeNo)` — 呼叫綠界 QueryTradeInfo API

**新增環境變數：**
- `ECPAY_MERCHANT_ID`、`ECPAY_HASH_KEY`、`ECPAY_HASH_IV`、`ECPAY_ENV`、`ECPAY_RETURN_URL`

**前端變更：** `views/pages/order-detail.ejs` 與 `public/js/pages/order-detail.js` 新增「使用信用卡付款」按鈕及 AIO 表單提交邏輯。

**業務邏輯：**
- 僅 `pending` 狀態的訂單可發起綠界付款
- `MerchantTradeNo` 由訂單 UUID 去除 `-` 後取前 20 碼
- 測試環境（`ECPAY_ENV` 非 `production`）自動使用 `payment-stage.ecpay.com.tw`

**錯誤情境：**

| 情境 | 狀態碼 | error |
|------|--------|-------|
| 訂單不存在或非本人 | 404 | NOT_FOUND |
| 訂單狀態非 pending | 400 | INVALID_STATUS |
| 環境變數未設定等組裝失敗 | 500 | ECPAY_ERROR |
| 綠界 QueryTradeInfo 呼叫失敗 | 502 | ECPAY_QUERY_FAILED |

## Tasks

- [x] 建立 `src/utils/ecpay.js`（CheckMacValue、buildAioParams、queryTradeInfo）
- [x] 在 `orderRoutes.js` 新增 `POST /:id/ecpay` 路由
- [x] 在 `orderRoutes.js` 新增 `POST /:id/ecpay/verify` 路由
- [x] 在 `app.js` 掛載 `POST /api/orders/ecpay/notify`（須在 orderRoutes 之前）
- [x] 更新 `order-detail.ejs` 與 `order-detail.js` 加入付款按鈕
- [x] 更新 `docs/FEATURES.md`
- [x] 更新 `docs/CHANGELOG.md`
- [x] 更新 `docs/ARCHITECTURE.md`
- [x] 更新 `docs/DEVELOPMENT.md`
