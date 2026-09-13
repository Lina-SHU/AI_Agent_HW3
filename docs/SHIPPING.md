# Shipping 配送費用

運費規則集中在 `src/utils/shipping.js`，CommonJS 匯出 `calculateShipping`，瀏覽器透過 `/js/shipping.js` 使用相同模組。

- 宅配（home）：基本運費 120 元；商品小計滿 1,500 元免除基本運費。
- 超商取貨（convenience_store）：取貨費 60 元，不適用滿額免運。
- 偏遠地區加收 200 元；當日急件加收 250 元。兩種配送方式均可累加附加費，滿額也不免除。
- 小計 1,499 元宅配總額為 1,619 元；小計 1,500 元宅配總額為 1,500 元。滿額且偏遠加急件的宅配運費為 450 元、超商為 510 元。

## 模組介面

`calculateShipping({ subtotal, shippingMethod = 'home', isRemote = false, isExpress = false })`

小計必須是非負安全整數（新台幣元）；配送方式只接受上述兩種值，旗標必須是布林值，無效輸入拋出 TypeError。回傳 subtotal、shippingMethod、isRemote、isExpress、baseFee、pickupFee、remoteFee、expressFee、shippingFee、totalAmount。

## 訂單 API

POST /api/orders 原有收件欄位不變，新增三個選填欄位：shippingMethod、isRemote、isExpress。省略時使用宅配、非偏遠、非急件。偏遠條件由呼叫端明確提供，不以地址文字推斷；超商取貨在 recipientAddress 填入門市完整地址。

範例請求：

```json
{
  "recipientName": "王小花",
  "recipientEmail": "flower@example.com",
  "recipientAddress": "配送地址",
  "shippingMethod": "home",
  "isRemote": true,
  "isExpress": true
}
```

伺服器使用資料庫商品價格與購物車數量計算 subtotal，不信任請求中的小計、運費或總額。配送條件無效回傳 HTTP 400 / VALIDATION_ERROR，不建單、不扣庫存、不清購物車。

建立訂單、我的訂單列表、詳情與模擬付款回應包含 subtotal、shipping_fee、shipping_method、is_remote、is_express、total_amount；回應旗標採 SQLite 整數 0 / 1。total_amount = subtotal + shipping_fee，綠界付款也使用此含運費總額。

## 持久化與前端

啟動時以可重複執行的 migration 新增上述五個運費相關欄位。舊訂單保持原總額，小計回填原 total_amount，運費為 0；不追溯收費。新訂單保存建立時的配送條件、運費與小計，查詢不重新計價。

購物車顯示預估宅配費；結帳可選配送方式及附加條件，即時顯示同一模組計算的運費與總額。最終金額以建單 API 為準。

## 測試

`npm test` 執行既有 tests/ 與新增 test/ 測試。

`npx vitest run test/shipping.test.js test/shipping-orders.test.js` 僅執行配送測試。單元測試涵蓋八項指定情境、超商滿額仍收費、預設值與無效輸入；API 測試驗證金額、持久化、查詢、付款、忽略偽造金額及驗證失敗無副作用。NODE_ENV=test 使用記憶體資料庫，不修改專案 database.sqlite。

`npm run openapi` 從路由註解重新產生根目錄 openapi.json。
