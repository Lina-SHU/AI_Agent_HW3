document.addEventListener('DOMContentLoaded', function () {
  const authNav = document.getElementById('auth-nav');
  const cartBadge = document.getElementById('cart-badge');

  if (authNav) {
    if (Auth.isLoggedIn()) {
      const user = Auth.getUser();
      let html = '';
      if (Auth.isAdmin()) {
        html += '<a href="/admin/products" class="text-rose-primary hover:text-rose-dark text-[13px] transition-colors">後台管理</a>';
      }
      html += '<span class="text-text-secondary text-[13px]">' + (user?.name || '') + '</span>';
      html += '<button onclick="Auth.logout()" class="text-text-muted hover:text-text-primary text-[13px] transition-colors">登出</button>';
      html += '<a href="/cart" class="flex items-center gap-1.5 bg-rose-primary text-text-primary px-4 py-1.5 rounded-full hover:bg-rose-dark transition-colors text-[13px] relative">';
      html += '<svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M6 2 3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4z"/><line x1="3" y1="6" x2="21" y2="6"/><path d="M16 10a4 4 0 0 1-8 0"/></svg>';
      html += '購物車';
      html += '<span id="cart-badge" class="bg-forest-deep rounded-full w-5 h-5 flex items-center justify-center text-[11px] font-medium" style="display:none;"></span>';
      html += '</a>';
      authNav.innerHTML = html;
    }
  }

  const badge = document.getElementById('cart-badge');
  if (badge) {
    apiFetch('/api/cart').then(function (res) {
      if (res && res.data && res.data.items && res.data.items.length > 0) {
        badge.textContent = res.data.items.length;
        badge.style.display = 'flex';
      }
    }).catch(function () {});
  }
});
