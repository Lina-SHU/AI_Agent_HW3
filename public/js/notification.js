const Notification = {
  _timeout: null,

  show(message, type = 'info') {
    const el = document.getElementById('notification-toast');
    if (!el) return;

    const colors = {
      success: 'bg-sage text-forest-dark',
      error: 'bg-rose-primary text-text-primary',
      warning: 'bg-apricot text-forest-dark',
      info: 'bg-forest-mid text-text-primary border border-forest-border'
    };

    el.className = 'fixed top-20 right-4 z-[100] px-5 py-3 rounded-xl shadow-lg text-sm transition-all duration-300 ' + (colors[type] || colors.info);
    el.textContent = message;
    el.style.display = 'block';
    el.style.opacity = '1';

    if (this._timeout) clearTimeout(this._timeout);
    this._timeout = setTimeout(() => {
      el.style.opacity = '0';
      setTimeout(() => { el.style.display = 'none'; }, 300);
    }, 3000);
  }
};
