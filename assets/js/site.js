/* Shared PhysicsHub shell behavior. Keep page-specific logic out of this file. */
(function () {
  function closeNav() {
    document.body.classList.remove('nav-open');
    document.getElementById('mobileMenuBtn')?.setAttribute('aria-expanded', 'false');
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
      mobileBtn.setAttribute('aria-expanded', String(open));
    });
    overlay?.addEventListener('click', closeNav);
    document.querySelectorAll('.nav-links .nav-tab, .nav-links .user-dropdown-item').forEach(el => {
      el.addEventListener('click', closeNav);
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
