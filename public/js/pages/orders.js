const { createApp, ref, computed, onMounted } = Vue;

createApp({
  setup() {
    if (!Auth.requireAuth()) return {};

    const orders = ref([]);
    const loading = ref(true);
    const statusFilter = ref('');

    const statusMap = {
      pending: { label: '待付款', cls: 'bg-forest-mid text-apricot border border-apricot/30' },
      paid: { label: '已付款', cls: 'bg-forest-mid text-sage border border-sage/30' },
      failed: { label: '付款失敗', cls: 'bg-forest-mid text-rose-primary border border-rose-primary/30' },
      delivered: { label: '已送達', cls: 'bg-forest-mid text-text-secondary border border-forest-border' },
    };

    const filteredOrders = computed(() => {
      if (!statusFilter.value) return orders.value;
      return orders.value.filter(o => o.status === statusFilter.value);
    });

    onMounted(async function () {
      try {
        const res = await apiFetch('/api/orders');
        orders.value = res.data.orders;
      } catch (e) {
        orders.value = [];
      } finally {
        loading.value = false;
      }
    });

    return { orders, filteredOrders, loading, statusMap, statusFilter };
  }
}).mount('#app');
