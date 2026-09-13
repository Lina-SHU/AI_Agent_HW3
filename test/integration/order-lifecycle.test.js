const { app, request, registerUser } = require('../../tests/setup');
const db = require('../../src/database');
const { randomUUID, createHash } = require('crypto');
const { verifyCheckMacValue, toMerchantTradeNo } = require('../../src/utils/ecpay');

const recipient = {
  recipientName: 'Integration Test', recipientEmail: 'integration@example.com',
  recipientAddress: '台北市中正區測試路123號', shippingMethod: 'home', isRemote: true, isExpress: true,
};
let token, userId, products;
const auth = () => ({ Authorization: `Bearer ${token}` });
function envelope(res, status, error = null) {
  expect(res.status).toBe(status);
  expect(res.headers['content-type']).toMatch(/application\/json/);
  expect(res.body).toEqual({ data: error ? null : expect.any(Object), error, message: expect.any(String) });
}
function state() {
  return Object.fromEntries(['orders', 'order_items', 'cart_items', 'products'].map(table =>
    [table, db.prepare(`SELECT * FROM ${table} ORDER BY id`).all()]));
}
async function addCart() {
  for (const product of products) {
    const response = await request(app).post('/api/cart').set(auth()).send({ productId: product.id, quantity: product.quantity });
    envelope(response, 200);
  }
}
async function createOrder(options = {}) {
  return request(app).post('/api/orders').set(auth()).send({ ...recipient, ...options });
}
// Independent signing of a synthetic gateway response; real HTTP transport is stubbed.
function gatewayResponse(fields) {
  const data = { MerchantID: process.env.ECPAY_MERCHANT_ID, ...fields };
  const pairs = Object.keys(data).sort((a,b) => a.toLowerCase().localeCompare(b.toLowerCase())).map(k => `${k}=${data[k]}`).join('&');
  let encoded = encodeURIComponent(`HashKey=${process.env.ECPAY_HASH_KEY}&${pairs}&HashIV=${process.env.ECPAY_HASH_IV}`)
    .replace(/%20/g, '+').replace(/~/g, '%7e').replace(/'/g, '%27').toLowerCase();
  for (const [key, value] of Object.entries({ '%2d':'-', '%5f':'_', '%2e':'.', '%21':'!', '%2a':'*', '%28':'(', '%29':')' })) encoded = encoded.split(key).join(value);
  data.CheckMacValue = createHash('sha256').update(encoded).digest('hex').toUpperCase();
  return new URLSearchParams(data).toString();
}

beforeEach(async () => {
  expect(process.env.NODE_ENV).toBe('test');
  expect(db.pragma('database_list').find(row => row.name === 'main').file).toBe('');
  db.exec('SAVEPOINT integration_case');
  const member = await registerUser();
  userId = member.user.id;
  const login = await request(app).post('/api/auth/login').send({ email: member.user.email, password: 'password123' });
  envelope(login, 200);
  expect(login.body.data.token).toEqual(expect.any(String));
  token = login.body.data.token;
  products = [
    { id: randomUUID(), name: 'Integration Rose', price: 500, stock: 8, quantity: 2 },
    { id: randomUUID(), name: 'Integration Lily', price: 499, stock: 7, quantity: 1 },
  ];
  for (const product of products) db.prepare('INSERT INTO products (id,name,price,stock) VALUES (?,?,?,?)').run(product.id,product.name,product.price,product.stock);
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  // Also removes fault-injection triggers and test members/products.
  db.exec('ROLLBACK TO integration_case; RELEASE integration_case');
});

it('registers/logs in, reads products, checks out and persists exact order/item/shipping/stock snapshots', async () => {
  const list = await request(app).get('/api/products');
  envelope(list, 200);
  expect(list.body.data.products.length).toBeGreaterThan(0);
  for (const product of products) {
    const detail = await request(app).get('/api/products/' + product.id);
    envelope(detail, 200);
    expect(detail.body.data).toMatchObject({ id: product.id, price: product.price, stock: product.stock });
  }
  await addCart();
  const result = await createOrder({ subtotal: 1, shipping_fee: 0, total_amount: 1 });
  envelope(result, 201);
  const order = result.body.data;
  const expected = { subtotal: 1499, shipping_fee: 570, total_amount: 2069, shipping_method: 'home', is_remote: 1, is_express: 1, status: 'pending' };
  expect(order).toMatchObject(expected);
  expect(order.order_no).toMatch(/^ORD-\d{8}-[A-F0-9]{5}$/);
  expect(db.prepare('SELECT * FROM orders WHERE id=?').get(order.id)).toMatchObject({ ...expected, user_id:userId, recipient_name:recipient.recipientName, recipient_email:recipient.recipientEmail, recipient_address:recipient.recipientAddress });
  const items = db.prepare('SELECT * FROM order_items WHERE order_id=?').all(order.id);
  expect(items).toHaveLength(2);
  expect(order.items).toHaveLength(2);
  for (const product of products) {
    const item = { product_name:product.name, product_price:product.price, quantity:product.quantity };
    expect(items.find(i => i.product_id === product.id)).toMatchObject({ ...item, order_id:order.id });
    expect(order.items).toContainEqual(item);
    expect(db.prepare('SELECT stock FROM products WHERE id=?').get(product.id).stock).toBe(product.stock-product.quantity);
  }
  const cart = await request(app).get('/api/cart').set(auth());
  envelope(cart, 200);
  expect(cart.body.data.items).toEqual([]);
  expect(db.prepare('SELECT * FROM cart_items WHERE user_id=?').all(userId)).toEqual([]);
  const detail = await request(app).get('/api/orders/' + order.id).set(auth());
  envelope(detail, 200);
  expect(detail.body.data).toMatchObject(expected);
});

it.each([
  ['missing recipient', { recipientName:'' }], ['invalid email', { recipientEmail:'invalid' }],
  ['invalid method', { shippingMethod:'unknown' }], ['invalid boolean', { isExpress:'true' }],
])('rejects %s without any partial writes', async (_, options) => {
  await addCart(); const before=state();
  envelope(await createOrder(options), 400, 'VALIDATION_ERROR');
  expect(state()).toEqual(before);
});
it('rejects an empty cart without creating an order', async () => {
  const before=state(); envelope(await createOrder(),400,'CART_EMPTY'); expect(state()).toEqual(before);
});
it('rejects checkout when stock changed after adding to cart', async () => {
  await addCart();
  db.prepare('UPDATE products SET stock=0 WHERE id=?').run(products[1].id);
  const before=state(); envelope(await createOrder(),400,'STOCK_INSUFFICIENT'); expect(state()).toEqual(before);
});
it('rolls back order, all items and stock when cart deletion fails at the end of the transaction', async () => {
  await addCart();
  db.exec(`CREATE TEMP TRIGGER fail_checkout BEFORE DELETE ON cart_items BEGIN SELECT RAISE(ABORT, 'integration rollback probe'); END;`);
  const before=state(); const log=vi.spyOn(console,'error').mockImplementation(() => {});
  envelope(await createOrder(),500,'INTERNAL_ERROR');
  expect(log).toHaveBeenCalledWith('Unhandled error:', 'integration rollback probe');
  expect(state()).toEqual(before);
});
it('requires authentication and does not write on unauthorized checkout', async () => {
  await addCart(); const before=state();
  envelope(await request(app).post('/api/orders').send(recipient),401,'UNAUTHORIZED');
  expect(state()).toEqual(before);
});

it('builds signed ECPay staging parameters with shipping included and a store return URL', async () => {
  await addCart(); const created=await createOrder(); envelope(created,201);
  const order=created.body.data;
  const res=await request(app).post(`/api/orders/${order.id}/ecpay`).set(auth()); envelope(res,200);
  expect(res.body.data.actionUrl).toBe('https://payment-stage.ecpay.com.tw/Cashier/AioCheckOut/V5');
  expect(res.body.data.params).toMatchObject({ TotalAmount:'2069', ChoosePayment:'Credit', MerchantTradeNo:toMerchantTradeNo(order.id), ClientBackURL:`http://localhost:3001/orders/${order.id}?payment_return=1` });
  expect(verifyCheckMacValue(res.body.data.params,process.env.ECPAY_HASH_KEY,process.env.ECPAY_HASH_IV)).toBe(true);
});
it.each(['1','0'])('only a signed paid gateway result changes order status (TradeStatus=%s)', async tradeStatus => {
  await addCart(); const created=await createOrder(); envelope(created,201); const order=created.body.data;
  const before=state();
  const transport=vi.fn().mockResolvedValue(new Response(gatewayResponse({ MerchantTradeNo:toMerchantTradeNo(order.id), TradeStatus:tradeStatus }),{status:200}));
  vi.stubGlobal('fetch',transport);
  const res=await request(app).post(`/api/orders/${order.id}/ecpay/verify`).set(auth()); envelope(res,200);
  const expected=tradeStatus==='1'?'paid':'pending';
  expect(res.body.data.status).toBe(expected);
  expect(db.prepare('SELECT status FROM orders WHERE id=?').get(order.id).status).toBe(expected);
  const [url,options]=transport.mock.calls[0];
  expect(url).toBe('https://payment-stage.ecpay.com.tw/Cashier/QueryTradeInfo/V5');
  expect(verifyCheckMacValue(Object.fromEntries(new URLSearchParams(options.body)),process.env.ECPAY_HASH_KEY,process.env.ECPAY_HASH_IV)).toBe(true);
  expect(state().products).toEqual(before.products);
  expect(state().order_items).toEqual(before.order_items);
  if(tradeStatus==='1') {
    envelope(await request(app).post(`/api/orders/${order.id}/ecpay/verify`).set(auth()),200);
    expect(transport).toHaveBeenCalledTimes(1);
    envelope(await request(app).post(`/api/orders/${order.id}/ecpay`).set(auth()),400,'INVALID_STATUS');
  }
});
it.each(['tampered','http-error','network-error'])('keeps pending status on gateway %s', async failure => {
  await addCart(); const created=await createOrder(); envelope(created,201); const order=created.body.data; const before=state();
  const transport=vi.fn();
  if(failure==='network-error') transport.mockRejectedValue(new Error('network unavailable'));
  else transport.mockResolvedValue(new Response(failure==='tampered'?'TradeStatus=1&CheckMacValue=INVALID':'error',{status:failure==='http-error'?502:200}));
  vi.stubGlobal('fetch',transport);
  envelope(await request(app).post(`/api/orders/${order.id}/ecpay/verify`).set(auth()),502,'ECPAY_QUERY_FAILED');
  expect(state()).toEqual(before);
});

