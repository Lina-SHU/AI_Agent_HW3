---
name: e2e-checkout-test
description: >
  使用 Playwright MCP 對花漾生活網站執行完整 E2E 結帳測試：
  啟動伺服器、登入、加入購物車、結帳建單、綠界（ECPay）測試環境信用卡付款、
  3D 驗證 OTP、驗證訂單狀態變為「已付款」。
  觸發詞：E2E 測試、結帳測試、綠界付款測試、購物流程測試。
---

# E2E 結帳付款測試（Playwright MCP）

對本專案（花漾生活，port 3001）執行從登入到綠界付款完成的全流程測試。

## 測試資料

| 項目 | 值 |
|------|-----|
| 登入帳號 | admin@hexschool.com / 12345678 |
| 測試卡號 | 4311-9522-2222-2222 |
| 卡片效期 | 任意未過期日期（如 12/29） |
| CVV | 任意 3 碼（如 222） |
| 3D 驗證 OTP | 1234（綠界測試頁會直接顯示在畫面上） |
| 持卡人姓名 | 任意英文姓名 |
| 手機號碼 | 任意台灣手機格式（如 0912345678） |

## 流程步驟

### 1. 確認／啟動伺服器

```bash
curl -s -o /dev/null -w "%{http_code}" http://localhost:3001/ --max-time 5
```

若非 200，以背景模式執行 `npm start`（會先建置 CSS 再啟動），然後輪詢直到回 200。

### 2. 登入

1. `browser_navigate` 到 `http://localhost:3001/`。
2. **若 header 已顯示登入狀態（出現「登出」按鈕），先點「登出」清除殘留 session。**
3. 前往 `/login`，填入帳密後點表單內的「登入」按鈕，成功後會導回首頁。

### 3. 加入購物車並結帳

1. 在首頁點任一商品的「加入購物車」。
2. 前往 `/cart`，確認品項與金額，點「前往結帳 →」。
3. 在 `/checkout` 填寫收件人姓名、Email、電話、地址，點「確認送出訂單」。
4. 成功後導向 `/orders/<uuid>`，狀態為「待付款」，記下訂單編號（ORD-YYYYMMDD-XXXXX）。
5. 點「前往綠界付款」，跳轉到 `https://payment-stage.ecpay.com.tw/Cashier/AioCheckOut/V5`。

### 4. 綠界付款頁（重要陷阱集中在這裡）

付款方式預設即為「信用卡」，表單直接顯示。

**⚠️ 陷阱 1 — 卡號欄位不能用 `fill()`**：
卡號四段欄位為 `#CCpart1` ~ `#CCpart4`，綠界靠 keyup/input 事件把四段組合進隱藏欄位做驗證。
用 Playwright `fill()` 填入後會一直顯示「請輸入信用卡卡號」。解法二擇一：
- 每段用 `browser_type` 並設 `slowly: true`（pressSequentially 逐字輸入）。
- 或 `fill()` 後用 `browser_evaluate` 對四個欄位補發事件：
  ```js
  ['CCpart1','CCpart2','CCpart3','CCpart4'].forEach(id => {
    const el = document.getElementById(id);
    ['input','keyup','change','blur'].forEach(evt =>
      el.dispatchEvent(new Event(evt, { bubbles: true })));
  });
  ```
  卡號驗證通過時欄位旁會出現 VISA 標誌與發卡行名稱。

其餘欄位（效期 MM/YY、CVV、持卡人姓名、手機）可正常 `fill()`。電子信箱與帳單地址為選填。

**⚠️ 陷阱 2 — 測試環境提示彈窗**：
第一次點「立即付款」可能先跳出「您目前正在使用的是綠界科技的付款測試環境…」彈窗，
點「關閉」後需**再點一次**「立即付款」。

**⚠️ 陷阱 3 — 確認付款彈窗**：
送出後出現「您確定使用信用卡，支付此筆訂單金額…」彈窗（非瀏覽器原生 dialog，是頁面內 modal），
確認按鈕為 `#btnConfirm`，點擊後才會進入 3D 驗證。

### 5. 3D 驗證（cc-stage.ecpay.com.tw）

1. 點「取得OTP服務密碼(Get the password)」。
2. 頁面會直接顯示「(OTP密碼：1234)」，在輸入框填 `1234`。
3. 點「送出(Submit)」→ 導向綠界「付款成功」頁。

### 6. 驗證結果

1. 在付款成功頁點「返回商店」，回到 `/orders/<uuid>`。
2. 確認訂單狀態徽章為「**已付款**」，且頁面顯示「付款成功」區塊。
3. 截圖存證，放到 `docs/test/`。

### 7. 清理

停止背景的 `npm start` 任務後，**Windows 上 node 子程序不會跟著結束**，需手動處理：

```bash
netstat -ano | grep ":3001" | grep LISTENING   # 取得 PID
taskkill //PID <pid> //F                        # Git Bash 下斜線要重複
```

最後再 curl 一次確認 port 3001 無回應（000）。

## 成功判準

- 訂單建立後狀態為「待付款」，付款完成返回後變為「已付款」。
- 綠界頁面顯示「付款成功」且金額與訂單總計一致。
- 購物車於建單後清空（header 購物車數字消失）。
