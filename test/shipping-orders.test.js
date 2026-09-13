const { app, request, registerUser } = require('../tests/setup');
const db = require('../src/database');
const { randomUUID } = require('crypto');

const recipient = { recipientName: '配送測試', recipientEmail: 'shipping@example.com', recipientAddress: '測試地址' };
async function cart(price) {
  const { token } = await registerUser();
  const productId = randomUUID();
  db.prepare('INSERT INTO products (id, name, price, stock) VALUES (?, ?, ?, ?)').run(productId, 'Shipping test', price, 5);
  const res = await request(app).post('/api/cart').set('Authorization', 'Bearer ' + token).send({ productId, quantity: 1 });
  expect(res.status).toBe(200);
  return { token, productId };
}
describe('Shipping order integration', () => {
  beforeEach(() => {
    expect(db.pragma('database_list')[0].file).toBe('');
    db.exec('SAVEPOINT shipping_test');
  });
  afterEach(() => db.exec('ROLLBACK TO shipping_test; RELEASE shipping_test')); 
  it.each([
    [1499, {}, 120], [1500, {}, 0],
    [1500, { shippingMethod: 'convenience_store' }, 60],
    [1499, { isRemote: true, isExpress: true }, 570],
    [1500, { isRemote: true, isExpress: true }, 450],
    [1500, { shippingMethod: 'convenience_store', isRemote: true, isExpress: true }, 510],
  ])('persists fee and total for %j %j', async (subtotal, options, fee) => {
    const { token, productId } = await cart(subtotal);
    const auth = 'Bearer ' + token;
    const res = await request(app).post('/api/orders').set('Authorization', auth)
      .send({ ...recipient, ...options, subtotal: 0, shipping_fee: 0, total_amount: 1 });
    expect(res.status).toBe(201);
    const expected = { subtotal, shipping_fee: fee, total_amount: subtotal + fee,
      shipping_method: options.shippingMethod || 'home', is_remote: Number(!!options.isRemote), is_express: Number(!!options.isExpress) };
    expect(res.body.data).toMatchObject(expected);
    const id = res.body.data.id;
    expect(db.prepare('SELECT * FROM orders WHERE id = ?').get(id)).toMatchObject(expected);
    expect(db.prepare('SELECT stock FROM products WHERE id = ?').get(productId).stock).toBe(4);
    const detail = await request(app).get('/api/orders/' + id).set('Authorization', auth);
    expect(detail.body.data).toMatchObject(expected);
    const list = await request(app).get('/api/orders').set('Authorization', auth);
    expect(list.body.data.orders.find(o => o.id === id)).toMatchObject(expected);
    const payment = await request(app).patch('/api/orders/' + id + '/pay').set('Authorization', auth).send({ action: 'success' });
    expect(payment.body.data).toMatchObject({ ...expected, status: 'paid' });
    const cleared = await request(app).get('/api/cart').set('Authorization', auth);
    expect(cleared.body.data.items).toHaveLength(0);
  });
  it.each([{ shippingMethod: 'unknown' }, { isRemote: 'false' }, { isExpress: null }])('rejects %j without changing cart or stock', async options => {
    const { token, productId } = await cart(1499);
    const before = db.prepare('SELECT COUNT(*) AS n FROM orders').get().n;
    const res = await request(app).post('/api/orders').set('Authorization', 'Bearer ' + token).send({ ...recipient, ...options });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('VALIDATION_ERROR');
    expect(db.prepare('SELECT stock FROM products WHERE id = ?').get(productId).stock).toBe(5);
    expect(db.prepare('SELECT COUNT(*) AS n FROM orders').get().n).toBe(before);
    const saved = await request(app).get('/api/cart').set('Authorization', 'Bearer ' + token);
    expect(saved.body.data.items).toHaveLength(1);
  });
});
