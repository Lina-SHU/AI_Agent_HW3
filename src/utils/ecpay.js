'use strict';
const crypto = require('crypto');

function ecpayUrlEncode(source) {
  let encoded = encodeURIComponent(source)
    .replace(/%20/g, '+')
    .replace(/~/g, '%7e')
    .replace(/'/g, '%27');
  encoded = encoded.toLowerCase();
  const replacements = { '%2d': '-', '%5f': '_', '%2e': '.', '%21': '!', '%2a': '*', '%28': '(', '%29': ')' };
  for (const [old, char] of Object.entries(replacements)) {
    encoded = encoded.split(old).join(char);
  }
  return encoded;
}

function generateCheckMacValue(params, hashKey, hashIv) {
  const filtered = Object.fromEntries(
    Object.entries(params).filter(([k]) => k !== 'CheckMacValue')
  );
  const sorted = Object.keys(filtered)
    .sort((a, b) => a.toLowerCase().localeCompare(b.toLowerCase()));
  const paramStr = sorted.map(k => `${k}=${filtered[k]}`).join('&');
  const raw = `HashKey=${hashKey}&${paramStr}&HashIV=${hashIv}`;
  return crypto.createHash('sha256').update(ecpayUrlEncode(raw), 'utf8').digest('hex').toUpperCase();
}

function toMerchantTradeNo(orderId) {
  return orderId.replace(/-/g, '').slice(0, 20);
}

function formatEcpayDate(date = new Date()) {
  // MerchantTradeDate 必須是 UTC+8，格式：yyyy/MM/dd HH:mm:ss
  const tw = new Date(date.getTime() + 8 * 60 * 60 * 1000);
  return tw.toISOString().slice(0, 19).replace('T', ' ').replace(/-/g, '/');
}

function buildItemName(items) {
  return items.map(i => `${i.product_name} x${i.quantity}`).join('#').slice(0, 200);
}

function buildAioParams({ orderId, totalAmount, items }) {
  const isStaging = process.env.ECPAY_ENV !== 'production';
  const baseUrl = isStaging
    ? 'https://payment-stage.ecpay.com.tw'
    : 'https://payment.ecpay.com.tw';
  const actionUrl = `${baseUrl}/Cashier/AioCheckOut/V5`;

  const merchantId = process.env.ECPAY_MERCHANT_ID;
  const hashKey    = process.env.ECPAY_HASH_KEY;
  const hashIv     = process.env.ECPAY_HASH_IV;
  const siteBase   = process.env.BASE_URL || 'http://localhost:3001';

  const returnUrl = process.env.ECPAY_RETURN_URL || `${siteBase}/api/orders/ecpay/notify`;

  // 本地端架構：綠界僅支援 port 80/443，localhost:3001 收不到 ReturnURL/OrderResultURL，
  // 且 OrderResultURL 與 ClientBackURL 同時設定時以 OrderResultURL 為主，設了反而蓋掉導回路徑。
  // 故不設 OrderResultURL，改由消費者點「返回商店」（ClientBackURL）帶 payment_return=1
  // 導回訂單頁，再由前端呼叫 QueryTradeInfo 主動確認付款結果。
  // Source: web_fetch https://developers.ecpay.com.tw/2858.md、2862.md 2026-06-10
  const params = {
    MerchantID:        merchantId,
    MerchantTradeNo:   toMerchantTradeNo(orderId),
    MerchantTradeDate: formatEcpayDate(),
    PaymentType:       'aio',
    TotalAmount:       String(totalAmount),
    TradeDesc:         '花卉電商訂單',
    ItemName:          buildItemName(items),
    ReturnURL:         returnUrl,
    ChoosePayment:     'Credit',
    EncryptType:       '1',
    ClientBackURL:     `${siteBase}/orders/${orderId}?payment_return=1`,
  };

  params.CheckMacValue = generateCheckMacValue(params, hashKey, hashIv);
  return { actionUrl, params };
}

async function queryTradeInfo(merchantTradeNo) {
  const isStaging = process.env.ECPAY_ENV !== 'production';
  const baseUrl = isStaging
    ? 'https://payment-stage.ecpay.com.tw'
    : 'https://payment.ecpay.com.tw';
  const url = `${baseUrl}/Cashier/QueryTradeInfo/V5`;

  const merchantId = process.env.ECPAY_MERCHANT_ID;
  const hashKey    = process.env.ECPAY_HASH_KEY;
  const hashIv     = process.env.ECPAY_HASH_IV;

  const params = {
    MerchantID:      merchantId,
    MerchantTradeNo: merchantTradeNo,
    TimeStamp:       String(Math.floor(Date.now() / 1000)),
  };
  params.CheckMacValue = generateCheckMacValue(params, hashKey, hashIv);

  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams(params).toString(),
  });

  if (!response.ok) {
    throw new Error(`ECPay 回傳狀態碼 ${response.status}`);
  }

  const text = await response.text();
  const result = Object.fromEntries(new URLSearchParams(text));

  // 付款結果以查詢回應為準，必須驗證回應的 CheckMacValue 防止結果遭竄改
  // TradeStatus：'0' 未付款、'1' 已付款、'10200095' 訂單未成立
  // Source: web_fetch https://developers.ecpay.com.tw/2890.md 2026-06-10
  if (!verifyCheckMacValue(result, hashKey, hashIv)) {
    throw new Error('綠界查詢回應 CheckMacValue 驗證失敗');
  }

  return { paid: result.TradeStatus === '1', tradeStatus: result.TradeStatus, rawResponse: result };
}

function verifyCheckMacValue(params, hashKey, hashIv) {
  const received = (params.CheckMacValue || '').toUpperCase();
  if (!received) return false;
  const computed = generateCheckMacValue(params, hashKey, hashIv);
  const bufA = Buffer.from(computed);
  const bufB = Buffer.from(received);
  if (bufA.length !== bufB.length) return false;
  return crypto.timingSafeEqual(bufA, bufB);
}

module.exports = { buildAioParams, queryTradeInfo, toMerchantTradeNo, verifyCheckMacValue };
