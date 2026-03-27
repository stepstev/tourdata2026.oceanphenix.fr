(function () {
  var KEY = 'op-theme-hint-seen';
  if (localStorage.getItem(KEY)) return;

  document.addEventListener('DOMContentLoaded', function () {
    var hint = document.getElementById('theme-hint');
    var closeBtn = document.getElementById('theme-hint-close');
    if (!hint || !closeBtn) return;

    // Show after a short delay so the page loads first
    setTimeout(function () {
      hint.classList.add('visible');
    }, 800);

    function dismiss() {
      hint.classList.remove('visible');
      hint.classList.add('hiding');
      localStorage.setItem(KEY, '1');
      setTimeout(function () {
        hint.remove();
      }, 500);
    }

    closeBtn.addEventListener('click', dismiss);

    // Auto-dismiss after 8 seconds
    setTimeout(dismiss, 9000);
  });
})();
