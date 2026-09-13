const { calculateShipping } = require('../src/utils/shipping');

describe('Shipping', () => {
  it.each([
    ['宅配基本運費', 1000, 'home', false, false, 120],
    ['超商取貨', 1000, 'convenience_store', false, false, 60],
    ['1499元未免運', 1499, 'home', false, false, 120],
    ['1500元免基本運費', 1500, 'home', false, false, 0],
    ['超過門檻', 1501, 'home', false, false, 0],
    ['偏遠地區', 1000, 'home', true, false, 320],
    ['當日急件', 1000, 'home', false, true, 370],
    ['多項附加費', 1000, 'home', true, true, 570],
    ['免運加偏遠', 1500, 'home', true, false, 200],
    ['免運加急件', 1500, 'home', false, true, 250],
    ['免運加兩項附加費', 1500, 'home', true, true, 450],
    ['滿額超商仍收費', 1500, 'convenience_store', false, false, 60],
    ['超商與附加費', 1500, 'convenience_store', true, true, 510],
  ])('%s', (_, subtotal, shippingMethod, isRemote, isExpress, fee) => {
    const result = calculateShipping({ subtotal, shippingMethod, isRemote, isExpress });
    expect(result.shippingFee).toBe(fee);
    expect(result.totalAmount).toBe(subtotal + fee);
    expect(result.baseFee + result.pickupFee + result.remoteFee + result.expressFee).toBe(fee);
  });
  it('defaults to home delivery without surcharges', () => {
    expect(calculateShipping({ subtotal: 0 })).toMatchObject({ shippingMethod: 'home', shippingFee: 120 });
  });
  it.each([
    { subtotal: -1 }, { subtotal: 1.5 }, { subtotal: '1500' }, { subtotal: NaN },
    { subtotal: Infinity }, { subtotal: Number.MAX_SAFE_INTEGER, isRemote: true },
    { subtotal: 100, shippingMethod: 'invalid' }, { subtotal: 100, shippingMethod: null },
    { subtotal: 100, isRemote: 'false' }, { subtotal: 100, isExpress: 1 },
  ])('rejects invalid input %j', input => expect(() => calculateShipping(input)).toThrow(TypeError));
});
