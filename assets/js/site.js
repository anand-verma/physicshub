/* Shared UPSC PhysicsHub shell behavior. Keep page-specific logic out of this file. */
(function () {
  const HAMBURGER_SVG = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 12h16M4 6h16M4 18h16" stroke-linecap="round"/></svg>';
  const CLOSE_SVG = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 18L18 6M6 6l12 12" stroke-linecap="round"/></svg>';

  function updateToggleBtn(open) {
    const mobileBtn = document.getElementById('mobileMenuBtn');
    if (!mobileBtn) return;
    mobileBtn.setAttribute('aria-expanded', String(open));
    mobileBtn.setAttribute('aria-label', open ? 'Close menu' : 'Toggle menu');
    mobileBtn.innerHTML = open ? CLOSE_SVG : HAMBURGER_SVG;
  }

  function closeNav() {
    document.body.classList.remove('nav-open');
    updateToggleBtn(false);
  }

  function setupShell() {
    const btn = document.getElementById('userMenuBtn');
    const dropdown = document.getElementById('userDropdown');
    if (btn && dropdown) {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const open = btn.getAttribute('aria-expanded') === 'true';
        btn.setAttribute('aria-expanded', String(!open));
        dropdown.classList.toggle('show', !open);
      });
      document.addEventListener('click', (e) => {
        if (!btn.contains(e.target) && !dropdown.contains(e.target)) {
          btn.setAttribute('aria-expanded', 'false');
          dropdown.classList.remove('show');
        }
      });
    }

    const mobileBtn = document.getElementById('mobileMenuBtn');
    const overlay = document.getElementById('navOverlay');
    mobileBtn?.addEventListener('click', () => {
      const open = document.body.classList.toggle('nav-open');
      updateToggleBtn(open);
    });
    overlay?.addEventListener('click', closeNav);
    document.querySelectorAll('.nav-links .nav-tab, .nav-links .user-dropdown-item').forEach(el => {
      el.addEventListener('click', closeNav);
    });

    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && document.body.classList.contains('nav-open')) {
        closeNav();
      }
    });

    const scroll = document.getElementById('scrollTopBtn');
    if (scroll) {
      const update = () => scroll.classList.toggle('show', window.scrollY > 100);
      window.addEventListener('scroll', update, { passive: true });
      update();
      scroll.addEventListener('click', () => window.scrollTo({ top: 0, behavior: 'smooth' }));
    }
  }

  document.addEventListener('DOMContentLoaded', setupShell);
})();

