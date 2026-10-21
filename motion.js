// Smooth scroll (Lenis), soft anchor jumps, and count-up numbers.
const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
const HEADER = 72;
const easeInOutQuart = (t) => (t < 0.5 ? 8 * t * t * t * t : 1 - Math.pow(-2 * t + 2, 4) / 2);

let lenis = null;

async function initLenis() {
  // touch devices keep native scrolling: it is already smooth and never fights sticky/fixed layers
  if (reduce || matchMedia('(hover: none), (pointer: coarse)').matches) return;
  const urls = ['https://unpkg.com/lenis@1/dist/lenis.mjs', 'https://cdn.jsdelivr.net/npm/lenis@1/dist/lenis.mjs'];
  for (const u of urls) {
    try {
      const mod = await import(u);
      const Lenis = mod.default || mod.Lenis;
      lenis = new Lenis({ duration: 1.35, easing: (t) => 1 - Math.pow(1 - t, 4), smoothWheel: true, wheelMultiplier: 0.9 });
      const raf = (t) => { lenis.raf(t); requestAnimationFrame(raf); };
      requestAnimationFrame(raf);
      document.documentElement.classList.add('lenis');
      return;
    } catch (e) { /* try next CDN */ }
  }
}

// Fallback eased scroll if Lenis is unavailable.
function glideTo(y, dur = 1400) {
  const start = scrollY, dist = y - start, t0 = performance.now();
  const step = (t) => {
    const k = Math.min(1, (t - t0) / dur);
    scrollTo(0, start + dist * easeInOutQuart(k));
    if (k < 1) requestAnimationFrame(step);
  };
  requestAnimationFrame(step);
}

// Every in-page link scrolls softly instead of jumping.
document.addEventListener('click', (e) => {
  const a = e.target.closest('a[href^="#"]');
  if (!a) return;
  const id = a.getAttribute('href');
  const el = id === '#top' ? document.body : document.querySelector(id);
  if (!el) return;
  e.preventDefault();
  const y = id === '#top' ? 0 : el.getBoundingClientRect().top + scrollY - HEADER + 1;
  if (reduce) { scrollTo(0, y); return; }
  const dist = Math.abs(y - scrollY);
  const duration = Math.min(2.4, 1.1 + dist / 4000);
  if (lenis) lenis.scrollTo(y, { duration, easing: easeInOutQuart });
  else glideTo(y, duration * 1000);
  history.replaceState(null, '', id);
});

// Count-up when numbers come into view.
const fmtInt = (suffix = '') => (n) => Math.round(n).toLocaleString('en-US') + suffix;
const io = new IntersectionObserver((entries) => {
  for (const en of entries) {
    if (!en.isIntersecting) continue;
    const el = en.target;
    io.unobserve(el);
    if (!window.countTo) continue;
    if (el.id === 'total') {
      const v = el._v ?? 0;
      el._v = 0;
      window.countTo(el, v, { dur: 1600 });
    } else {
      const to = parseFloat(el.dataset.count);
      el._v = 0;
      el.textContent = fmtInt(el.dataset.suffix)(0);
      window.countTo(el, to, { dur: 1800, fmt: fmtInt(el.dataset.suffix) });
    }
  }
}, { threshold: 0.6 });
document.querySelectorAll('[data-count], #total').forEach((el) => io.observe(el));

initLenis();
