const { createApp, ref, onMounted } = Vue;

createApp({
  setup() {
    if (!Auth.requireAuth()) return {};

    const el = document.getElementById('app');
    const orderId = el.dataset.orderId;
    const paymentResult = ref(el.dataset.paymentResult || null);

    const order     = ref(null);
    const loading   = ref(true);
    const paying    = ref(false);
    const verifying = ref(false);

    const statusMap = {
      pending: { label: '待付款', cls: 'bg-apricot/10 text-apricot border-apricot/30' },
      paid:    { label: '已付款', cls: 'bg-sage/10 text-sage border-sage/30' },
      failed:  { label: '付款失敗', cls: 'bg-red-500/10 text-red-400 border-red-500/30' },
    };

    // success 由專屬的付款成功卡片呈現（order-detail.ejs），此表僅供 failed / cancel 小型提示
    const paymentMessages = {
      failed:  { text: '付款失敗，請重試。', cls: 'bg-red-50 text-red-600 border border-red-100' },
      cancel:  { text: '付款已取消。', cls: 'bg-apricot/10 text-apricot border border-apricot/20' },
    };

    async function goToEcpay() {
      if (!order.value || paying.value) return;
      paying.value = true;
      try {
        const res = await apiFetch('/api/orders/' + order.value.id + '/ecpay', { method: 'POST' });
        const { actionUrl, params } = res.data;

        const form = document.createElement('form');
        form.method = 'POST';
        form.action = actionUrl;
        Object.entries(params).forEach(([key, value]) => {
          const input = document.createElement('input');
          input.type = 'hidden';
          input.name = key;
          input.value = value;
          form.appendChild(input);
        });
        document.body.appendChild(form);
        form.submit();
        // 頁面即將跳轉，無需重設 paying
      } catch (e) {
        Notification.show('無法建立付款，請稍後再試', 'error');
        paying.value = false;
      }
    }

    async function verifyPayment() {
      if (!order.value || verifying.value) return;
      verifying.value = true;
      try {
        const res = await apiFetch('/api/orders/' + order.value.id + '/ecpay/verify', { method: 'POST' });
        order.value = res.data;
        paymentResult.value = res.data.status === 'paid' ? 'success' : null;
        if (res.data.status !== 'paid') {
          Notification.show(res.message || '付款尚未完成', 'info');
        }
      } catch (e) {
        Notification.show('付款驗證失敗，請重新整理頁面', 'error');
      } finally {
        verifying.value = false;
        // 清除 query string，避免重整頁面再次觸發驗證
        const url = new URL(window.location.href);
        url.searchParams.delete('payment_return');
        window.history.replaceState({}, '', url.toString());
      }
    }

    onMounted(async function () {
      try {
        const res = await apiFetch('/api/orders/' + orderId);
        order.value = res.data;

        const urlParams = new URLSearchParams(window.location.search);
        if (urlParams.get('payment_return') === '1' && order.value.status === 'pending') {
          await verifyPayment();
        }
      } catch (e) {
        Notification.show('載入訂單失敗', 'error');
      } finally {
        loading.value = false;
      }
    });

    return {
      order, loading, paying, verifying, paymentResult,
      statusMap, paymentMessages,
      goToEcpay,
    };
  }
}).mount('#app');
