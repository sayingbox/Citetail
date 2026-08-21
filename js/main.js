// ===== Mobile Navigation =====
document.addEventListener('DOMContentLoaded', function () {

  const mobileToggle = document.getElementById('mobileToggle');
  const mobileMenu = document.getElementById('mobileMenu');

  if (mobileToggle && mobileMenu) {
    // Open/close the full mobile menu
    mobileToggle.addEventListener('click', function () {
      mobileMenu.classList.toggle('open');
    });

    // Inside mobile menu, tap a trigger to expand/collapse its dropdown (accordion-style)
    document.querySelectorAll('.mobile-menu .nav-trigger').forEach(function (btn) {
      btn.addEventListener('click', function () {
        btn.closest('.nav-item').classList.toggle('open');
      });
    });

    // Close mobile menu when an actual link is tapped
    document.querySelectorAll('.mobile-menu a').forEach(function (link) {
      link.addEventListener('click', function () {
        mobileMenu.classList.remove('open');
      });
    });
  }

});
