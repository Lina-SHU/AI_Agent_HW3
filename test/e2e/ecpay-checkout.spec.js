const { test, expect } = require('@playwright/test');
const fs = require('fs');
const path = require('path');

async function ready(page) {
  // SSR inputs exist before Vue binds v-model; wait for hydration before filling.
  await page.waitForFunction(() => !!document.querySelector('#app')?.__vue_app__);
}
async function evidence(page, testInfo, filename) {
  const output = path.resolve('docs/test', filename);
  fs.mkdirSync(path.dirname(output), { recursive:true });
  await page.evaluate(() => document.fonts.ready);
  await page.screenshot({ path:output, fullPage:true, animations:'disabled' });
  await testInfo.attach(filename, { path:output, contentType:'image/png' });
}

test('登入、購物、配送結帳、綠界信用卡與 OTP、返回商店已付款', async ({ page, request }, testInfo) => {
  const health = await request.get('/api/products');
  expect(health.status(), '請先啟動既有 localhost:3001；本測試不會啟動伺服器').toBe(200);
  const products = (await health.json()).data.products;
  const product = products.find(p => p.stock > 0);
  expect(product, '至少需要一個有庫存商品').toBeTruthy();
  let token, order;

  await test.step('登入指定會員，確認購物車為空', async () => {
    await page.goto('/login'); await ready(page);
    await page.getByPlaceholder('請輸入 Email').fill('admin@hexschool.com');
    await page.getByPlaceholder('請輸入密碼').fill('12345678');
    const loginResponse = page.waitForResponse(r => new URL(r.url()).pathname === '/api/auth/login' && r.request().method() === 'POST');
    await page.getByRole('button', { name:'登入', exact:true }).last().click();
    expect((await loginResponse).status()).toBe(200);
    await page.waitForURL('http://localhost:3001/'); await ready(page);
    token = await page.evaluate(() => localStorage.getItem('flower_token'));
    expect(token).toBeTruthy();
    const cart = await request.get('/api/cart', { headers:{ Authorization:`Bearer ${token}` } });
    expect(cart.status()).toBe(200);
    expect((await cart.json()).data.items, '既有購物車不為空，請先處理原有商品，避免測試將其結帳').toEqual([]);
  });

  await test.step('從前端選擇商品、加入購物車並進入結帳', async () => {
    await page.goto('/products/' + product.id); await ready(page);
    await expect(page.getByRole('button', { name:'加入購物車', exact:true })).toBeEnabled();
    const added = page.waitForResponse(r => new URL(r.url()).pathname === '/api/cart' && r.request().method() === 'POST');
    await page.getByRole('button', { name:'加入購物車', exact:true }).click();
    expect((await added).status()).toBe(200);
    await page.getByRole('link', { name:/購物車/ }).first().click();
    await ready(page);
    await page.getByRole('button', { name:'前往結帳 →' }).click();
    await page.waitForURL('**/checkout'); await ready(page);
    await expect(page.getByRole('radio', { name:/超商取貨/ })).toBeVisible();
  });

  await test.step('填寫配送方式及收件資訊，驗證建立的訂單與庫存', async () => {
    await page.getByRole('radio', { name:/超商取貨/ }).check();
    await page.getByRole('checkbox', { name:/偏遠地區/ }).uncheck();
    await page.getByRole('checkbox', { name:/當日急件/ }).uncheck();
    await page.getByPlaceholder('請輸入收件人姓名').fill('E2E Payment Test');
    await page.getByPlaceholder('請輸入 Email').fill('e2e@example.com');
    await page.getByPlaceholder('請輸入電話號碼').fill('0912345678');
    await page.getByPlaceholder('請輸入完整地址').fill('台北市中正區測試路123號 測試門市');
    await page.getByPlaceholder('如有特殊需求請填寫...').fill('Playwright E2E 綠界測試訂單');
    await expect(page.getByText('NT$ 60', { exact:true })).toBeVisible();
    const created = page.waitForResponse(r => new URL(r.url()).pathname === '/api/orders' && r.request().method() === 'POST');
    await page.getByRole('button', { name:'確認送出訂單' }).click();
    expect((await created).status()).toBe(201);
    await page.waitForURL(/\/orders\/[a-f0-9-]+/); await ready(page);
    const id = new URL(page.url()).pathname.split('/').pop();
    const response = await request.get('/api/orders/' + id, { headers:{ Authorization:`Bearer ${token}` } });
    expect(response.status()).toBe(200);
    const body = await response.json();
    expect(body).toMatchObject({ error:null, message:expect.any(String) });
    order = body.data;
    expect(order).toMatchObject({ id, shipping_method:'convenience_store', is_remote:0, is_express:0, shipping_fee:60,
      subtotal:product.price, total_amount:product.price+60, status:'pending', recipient_name:'E2E Payment Test', recipient_email:'e2e@example.com' });
    expect(order.items).toHaveLength(1);
    expect(order.items[0]).toMatchObject({ product_id:product.id, product_price:product.price, quantity:1 });
    const stock = await request.get('/api/products/' + product.id);
    expect((await stock.json()).data.stock).toBe(product.stock-1);
    const cart = await request.get('/api/cart', { headers:{ Authorization:`Bearer ${token}` } });
    expect((await cart.json()).data.items).toEqual([]);
  });

  await test.step('前往綠界測試環境並填寫信用卡', async () => {
    // Inspect the real payment response before the browser sends the form.
    // No response mocking or simulated /pay calls are used in this E2E.
    await page.route('**/api/orders/*/ecpay', async route => {
      const response = await route.fetch();
      const body = await response.json();
      expect(response.status()).toBe(200);
      expect(body.data.actionUrl).toBe('https://payment-stage.ecpay.com.tw/Cashier/AioCheckOut/V5');
      expect(body.data.params.TotalAmount).toBe(String(order.total_amount));
      await route.fulfill({ response });
    });
    await page.getByRole('button', { name:'前往綠界付款' }).click();
    await page.waitForURL('https://payment-stage.ecpay.com.tw/**');
    await page.getByText('信用卡', { exact:true }).first().click();
    // ECPay composes its hidden card number on keyup, so fill() alone is insufficient.
    for(const [id,value] of Object.entries({ CCpart1:'4311', CCpart2:'9522', CCpart3:'2222', CCpart4:'2222' })) {
      await page.locator('#'+id).fill('');
      await page.locator('#'+id).pressSequentially(value, { delay:80 });
    }
    await page.locator('#creditMM').fill('12');
    await page.locator('#creditYY').fill(String((new Date().getFullYear()+3)%100).padStart(2,'0'));
    await page.locator('#CreditBackThree').fill('222');
    await page.locator('#CCHolderTemp').fill('TEST USER');
    await page.locator('#CellPhoneCheck').fill('0912345678');
    await page.locator('#CellPhoneCheck').press('Tab');
    // Some gateway layouts have a preliminary button; current desktop layout goes straight to 立即付款.
    if (!(await page.locator('#CreditPaySubmit').isVisible())) {
      await page.getByText('前往付款', { exact:true }).filter({ visible:true }).click();
    }
  });

  await test.step('關閉測試環境提示，再次立即付款並確認金額', async () => {
    await page.locator('#CreditPaySubmit').click();
    await expect(page.getByText(/您目前正在使用的是綠界科技的付款測試環境/)).toBeVisible();
    await page.getByText('關閉', { exact:true }).click();
    await page.locator('#CreditPaySubmit').click();
    await expect(page.getByText(/您確定使用信用卡，支付此筆訂單金額/)).toContainText(String(order.total_amount));
    await page.getByText('確定', { exact:true }).click();
  });

  await test.step('取得 OTP 1234 並提交 3D 驗證', async () => {
    await page.waitForURL('https://cc-stage.ecpay.com.tw/**');
    await page.getByRole('link', { name:'取得OTP服務密碼(Get the password)', exact:true }).click();
    await expect(page.getByText('(OTP密碼：1234)', { exact:true })).toBeVisible();
    await page.locator('#OTP').fill('1234');
    await page.getByRole('link', { name:'送出(Submit)', exact:true }).click();
    await expect(page.getByText('付款成功', { exact:true })).toBeVisible({ timeout:60000 });
    expect(new URL(page.url()).hostname).toBe('payment-stage.ecpay.com.tw');
    await evidence(page, testInfo, 'ecpay-payment-success.png');
  });

  await test.step('返回商店，驗證畫面與 API 均已付款，保存成功截圖', async () => {
    const verified = page.waitForResponse(r => new URL(r.url()).pathname === `/api/orders/${order.id}/ecpay/verify` && r.request().method() === 'POST', { timeout:60000 });
    await page.getByText('返回商店', { exact:true }).click();
    await page.waitForURL('http://localhost:3001/orders/**');
    const verifyResponse = await verified;
    expect(verifyResponse.status()).toBe(200);
    expect((await verifyResponse.json()).data.status).toBe('paid');
    await expect(page.getByText('已付款', { exact:true })).toBeVisible({ timeout:60000 });
    await expect(page.getByRole('heading', { name:'付款成功', exact:true })).toBeVisible();
    const result = await request.get('/api/orders/' + order.id, { headers:{ Authorization:`Bearer ${token}` } });
    expect(result.status()).toBe(200);
    expect((await result.json()).data).toMatchObject({ id:order.id, status:'paid', shipping_fee:60, total_amount:order.total_amount });
    await evidence(page, testInfo, 'ecpay-store-paid.png');
    const proof = { verifiedAt:new Date().toISOString(), orderId:order.id, orderNo:order.order_no,
      status:'paid', subtotal:order.subtotal, shippingFee:order.shipping_fee, totalAmount:order.total_amount,
      paymentEnvironment:'ECPay staging', returnedUrl:page.url(),
      screenshots:['ecpay-payment-success.png','ecpay-store-paid.png'] };
    fs.writeFileSync(path.resolve('docs/test/ecpay-e2e-result.json'),JSON.stringify(proof,null,2)+'\n');
    await testInfo.attach('paid-order', { body:JSON.stringify(proof,null,2), contentType:'application/json' });
  });
});
