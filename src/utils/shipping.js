// Shared by Node.js and the browser; no database or HTTP dependencies.
(function (root) {
  'use strict';
  const FREE_SHIPPING_THRESHOLD = 1500;

  function calculateShipping({ subtotal, shippingMethod = 'home', isRemote = false, isExpress = false } = {}) {
    if (!Number.isSafeInteger(subtotal) || subtotal < 0) {
      throw new TypeError('subtotal 必須為非負安全整數');
    }
    if (!['home', 'convenience_store'].includes(shippingMethod)) {
      throw new TypeError('shippingMethod 必須為 home 或 convenience_store');
    }
    if (typeof isRemote !== 'boolean' || typeof isExpress !== 'boolean') {
      throw new TypeError('isRemote 與 isExpress 必須為布林值');
    }
    const baseFee = shippingMethod === 'home' && subtotal < FREE_SHIPPING_THRESHOLD ? 120 : 0;
    const pickupFee = shippingMethod === 'convenience_store' ? 60 : 0;
    const remoteFee = isRemote ? 200 : 0;
    const expressFee = isExpress ? 250 : 0;
    const shippingFee = baseFee + pickupFee + remoteFee + expressFee;
    const totalAmount = subtotal + shippingFee;
    if (!Number.isSafeInteger(totalAmount)) throw new TypeError('訂單總額超出安全整數範圍');
    return { subtotal, shippingMethod, isRemote, isExpress, baseFee, pickupFee, remoteFee, expressFee, shippingFee, totalAmount };
  }

  const Shipping = Object.freeze({ calculateShipping, FREE_SHIPPING_THRESHOLD });
  if (typeof module === 'object' && module.exports) module.exports = Shipping;
  else root.Shipping = Shipping;
})(typeof globalThis !== 'undefined' ? globalThis : this);
