# 測試流程

專案提供 Vitest 單元測試、Vitest + Supertest 整合測試，以及 Playwright 綠界付款 E2E。請使用 Node.js 20 以上並先執行 `npm ci`。

## 指令

```bash
npm run test:unit
npm run test:integration
npm run test:e2e
npm run postman
```

`npm test` 執行所有 Vitest 測試（含原有 `tests/` API 回歸測試），不執行會建立網站訂單的 E2E。

## 單元測試

設定檔：`vitest.unit.config.js`。目前包含 `test/shipping.test.js` 的 24 項測試，不載入 Express 或 SQLite。涵蓋宅配、超商、1,499 / 1,500 元門檻、偏遠、急件、多項附加費、滿額搭配附加費、預設值與無效輸入。

## 整合測試

設定檔：`vitest.integration.config.js`。測試檔：

- `test/integration/order-lifecycle.test.js`：15 項會員、商品、訂單交易、庫存及付款 API 測試。
- `test/shipping-orders.test.js`：9 項配送金額與輸入驗證測試。
- `test/integration/environment.js`：在載入 app 前設定 `NODE_ENV=test`、測試 JWT 與綠界測試參數。

Supertest 直接呼叫 Express app，不連線到 localhost:3001，也不啟動專案伺服器。`src/database.js` 在測試環境使用 `:memory:`；每個案例先透過 `PRAGMA database_list` 確認主資料庫沒有檔案路徑，再建立 SAVEPOINT。測試結束後 ROLLBACK / RELEASE，清除該案例的會員、商品、購物車、訂單、品項及故障注入 trigger。**整合測試不得開啟或修改原有 `database.sqlite`、WAL 或 SHM。**

完整流程包括註冊並登入測試會員、API 取得商品、加入兩種商品及不同數量、建立含配送資訊的訂單，逐項檢查：

- HTTP 狀態碼、JSON Content-Type 與 `{ data, error, message }`。
- 訂單收件資訊、配送條件、小計、運費及含運費總額。
- 訂單品項的商品 ID、名稱、價格、數量與訂單關聯。
- 每項庫存扣除、API 及資料庫購物車清空。
- 未授權、空購物車、無效配送或收件資訊、下單前庫存不足時沒有副作用。
- 在交易最後的清空購物車步驟注入 SQLite `RAISE(ABORT)`，驗證先前的訂單、全部品項及庫存修改均回滾。

綠界 API 測試使用真正的簽章組裝與回應驗證程式，只替換外部 `fetch` 傳輸。測試簽章正確的已付款與未付款結果、被竄改的回應、HTTP 錯誤及網路錯誤；只有已付款結果可更新 `paid`。亦驗證再次查詢已付款訂單不重複查詢、不重複扣庫存，以及 AIO 金額包含運費。

## Playwright E2E

設定檔：`playwright.config.js`；測試檔：`test/e2e/ecpay-checkout.spec.js`。

執行前的條件：

- **既有網站已在 `http://localhost:3001` 啟動。** 設定沒有 `webServer`，測試不啟動、重啟或替換伺服器。
- Chrome 已安裝。預設使用 `channel: chrome`；可透過環境變數 `PLAYWRIGHT_CHANNEL=msedge` 使用已安裝的 Edge。
- `admin@hexschool.com` / `12345678` 可以登入，購物車為空，至少有一個有庫存商品。購物車有既有項目時測試立即失敗，不刪除或結帳使用者原有項目。
- 已啟動服務採綠界測試設定，能連線到綠界與頁面所需的 Vue CDN。測試會檢查付款網址必須是 `payment-stage.ecpay.com.tw`，金額必須等於含運費訂單總額。

流程使用前端登入、商品詳情加入購物車、前往結帳、選超商取貨、填寫收件資訊、建立訂單。驗證運費 60 元、API 訂單與品項、庫存及購物車後，透過前端進入真正的綠界測試付款頁。

測試卡號為 `4311-9522-2222-2222`；效期使用當年度加 3 年的 12 月，CVV `222`，持卡人 `TEST USER`，手機 `0912345678`。卡號使用逐鍵輸入，讓綠界頁面的 keyup 驗證及完整卡號組裝正常觸發。

目前桌面版信用卡頁直接顯示「立即付款」；若版型出現可見的「前往付款」，測試亦會處理。第一次「立即付款」出現測試環境警示，按「關閉」後再次按「立即付款」，確認付款金額。進入 3D 頁後按「取得OTP服務密碼(Get the password)」，驗證顯示 `(OTP密碼：1234)`，輸入 `1234` 並按「送出(Submit)」。

綠界顯示付款成功後保存截圖，點「返回商店」，等待站內真正的 `/ecpay/verify` API 查詢綠界，再確認畫面「已付款」及 GET 訂單 API 的 `status: paid`。E2E 不呼叫模擬付款 `/pay`，不偽造付款回應或直接修改資料庫。

**E2E 操作的是已啟動網站的資料庫，會建立測試訂單並扣除一件庫存。** 這與使用記憶體資料庫的整合測試分開。成功訂單保留以供驗收；失敗後已建立的訂單亦保留，不刪除付款或庫存紀錄。重跑會新增一筆訂單，請勿與人工操作相同帳號同時進行。

成功證據（每次成功執行更新）：

- `docs/test/ecpay-payment-success.png`：綠界付款成功頁。
- `docs/test/ecpay-store-paid.png`：返回商店後的已付款訂單頁。
- `docs/test/ecpay-e2e-result.json`：成功時間、訂單 ID / 編號、運費、總額及狀態，無 JWT 或付款密鑰。

測試報告：`playwright-report/index.html`；失敗截圖與 trace：`test-results/`。可執行 `npx playwright show-report` 或 `npx playwright show-trace <trace.zip>`。預設不自動重試，避免付款失敗時默默建立更多訂單。

## OpenAPI 與 Postman

```bash
npm run postman
```

此指令先呼叫專案原有 `generate-openapi.js`，更新根目錄 `openapi.json`，再以 `openapi-to-postmanv2` 轉換，輸出 `postman/flower-shop.postman_collection.json`（Postman v2.1）。產生器會驗證 JSON、每個 OpenAPI operation 都有對應請求，且 API 網址使用 `{{baseUrl}}`。

Collection 包含 `baseUrl`（預設 `http://localhost:3001`）、`token`、`sessionId`，以及 `productId`、`cartItemId`、`orderId`。Session ID 在首次執行前自動產生。登入成功自動儲存 JWT，需登入的請求自動使用 Bearer `{{token}}`，公開請求使用 noauth。

匯入 Collection 後，建議手動依序執行：Auth 登入 → Products 商品列表（自動儲存 productId）→ Cart 加入購物車 → Cart 查看（儲存 cartItemId）→ Orders 建立（儲存 orderId）→ 查詢訂單。收件與配送欄位已提供可修改的範例。

Collection 同時包含管理員新增、修改、刪除及模擬付款等全部 OpenAPI 操作；它是 API 操作集合，不是無副作用的整套 Collection Runner 測試。綠界信用卡與 OTP 全流程請使用 `npm run test:e2e`。

## GitHub Actions

`.github/workflows/test.yml` 在 push、pull request 時自動執行，也可在 Actions 頁面手動觸發。使用 Ubuntu、Node.js 22、npm 快取及 `npm ci` 安裝鎖定版本的依賴。

Workflow 分開顯示 `Unit Test`（`npm run test:unit`）與 `Integration Test`（`npm run test:integration`）兩個步驟。測試失敗會使工作失敗，不執行 Playwright、不啟動前後端服務，也不需要設定 GitHub Secrets。整合測試仍使用記憶體 SQLite 與測試付款回應。
