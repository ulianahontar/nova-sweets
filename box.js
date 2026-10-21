// The travelling NOVA box: one Spline scene, driven by page scroll.
// Slots (.box-slot[data-slot]) mark where the box should sit; between
// linked slots it glides and morphs, elsewhere it fades out.

const SCENE_URL = 'https://prod.spline.design/1L1Zps3gQ36F315g/scene.splinecode';
const RUNTIME_URLS = [
  'https://unpkg.com/@splinetool/runtime@1/build/runtime.js',
  'https://cdn.jsdelivr.net/npm/@splinetool/runtime@1/build/runtime.js',
];

const DEG = Math.PI / 180;
const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
const layer = document.getElementById('boxLayer');
const canvas = document.getElementById('spline');

// Pose per slot. rot = box yaw (rad), lid/sleeve/logo/sweets are 0..1, spin = idle rotation strength.
const STATES = {
  hero:    { rot: -0.35, tilt: 0,    lid: 0, sleeve: 0, logo: 0, sweets: 0, spin: 1,   size: 0.95 },
  brand:   { rot: -0.75, tilt: 0.05, lid: 0, sleeve: 0, logo: 1, sweets: 0, spin: 0,   size: 0.95 },
  inside:  { rot: -0.25, tilt: 0.22, lid: 1, sleeve: 1, logo: 1, sweets: 1, spin: 0,   size: 1.0 },
  contact: { rot: -0.55, tilt: 0,    lid: 0, sleeve: 0, logo: 0, sweets: 0, spin: 0.35, size: 0.9 },
};
const LINKED = new Set(['hero>brand', 'brand>inside']);

const lerp = (a, b, t) => a + (b - a) * t;
const clamp = (v, a = 0, b = 1) => Math.min(b, Math.max(a, v));
const ease = (t) => t * t * (3 - 2 * t);
const mix = (A, B, t) => {
  const o = {};
  for (const k in A) o[k] = lerp(A[k], B[k], t);
  return o;
};

let objs = null;      // Spline objects + their base transforms
let spinAngle = 0;
let cur = null;
let pointer = { x: 0, y: 0 };
let last = performance.now();

function layerSize() {
  return layer.getBoundingClientRect().width / (parseFloat(layer.dataset.scale) || 1) || layer.offsetWidth;
}

// Where should the box be right now, and in which pose?
function compute() {
  const slots = [...document.querySelectorAll('.box-slot')]
    .map((el) => {
      const r = el.getBoundingClientRect();
      return { name: el.dataset.slot, cx: r.left + r.width / 2, cy: r.top + r.height / 2, w: r.width, h: r.height };
    })
    .filter((s) => s.w > 0);
  if (!slots.length) return null;
  const vc = innerHeight / 2;
  const vh = innerHeight;

  for (let i = 0; i < slots.length - 1; i++) {
    const a = slots[i], b = slots[i + 1];
    if (a.cy <= vc && vc <= b.cy && LINKED.has(a.name + '>' + b.name)) {
      const t = ease(clamp((vc - a.cy) / (b.cy - a.cy)));
      return {
        x: lerp(a.cx, b.cx, t), y: lerp(a.cy, b.cy, t),
        w: lerp(a.w, b.w, t), opacity: 1,
        pose: mix(STATES[a.name], STATES[b.name], t),
      };
    }
  }
  // Not between linked slots: stick to the nearest one and fade with distance.
  let best = slots[0], bd = Infinity;
  for (const s of slots) {
    const d = Math.abs(s.cy - vc);
    if (d < bd) { bd = d; best = s; }
  }
  const opacity = clamp(1 - (bd - vh * 0.38) / (vh * 0.22));
  return { x: best.cx, y: best.cy, w: best.w, opacity, pose: { ...STATES[best.name] } };
}

function frame(now) {
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;
  const target = compute();
  let st = null;
  if (target) {
    // ease toward the target so the box glides instead of snapping
    const k = reduce ? 1 : 1 - Math.exp(-dt * 7);
    if (!cur) cur = JSON.parse(JSON.stringify(target));
    for (const key of ['x', 'y', 'w', 'opacity']) cur[key] = lerp(cur[key], target[key], k);
    for (const key in target.pose) cur.pose[key] = lerp(cur.pose[key] ?? target.pose[key], target.pose[key], k);
    st = cur;
  }
  if (st) {
    const L = layer.offsetWidth;
    const s = (st.w * st.pose.size) / L;
    layer.dataset.scale = s;
    layer.style.transform = `translate(${st.x - (L * s) / 2}px, ${st.y - (L * s) / 2}px) scale(${s})`;
    const hidden = st.opacity < 0.01;
    layer.classList.toggle('off', hidden);
    layer.style.opacity = st.opacity.toFixed(3);
    if (objs && !hidden) applyPose(st.pose, dt);
  }
  requestAnimationFrame(frame);
}

function applyPose(p, dt) {
  const { box, hinge, sleeve, logoNova, logoClient, sweets, base } = objs;
  if (!reduce) spinAngle += dt * 0.45 * p.spin;
  // keep the spin angle close to the target so blending out of spin never jumps a full turn
  const target = p.rot;
  let a = spinAngle;
  while (a - target > Math.PI) a -= Math.PI * 2;
  while (a - target < -Math.PI) a += Math.PI * 2;
  spinAngle = a;
  const yaw = lerp(target, a, clamp(p.spin * 1.6)) + pointer.x * 0.12;

  box.rotation.y = base.boxRotY + yaw;
  box.rotation.x = base.boxRotX + p.tilt + pointer.y * 0.06;
  hinge.rotation.x = base.hingeRotX - 105 * DEG * ease(clamp(p.lid));
  sleeve.position.x = base.sleeveX + 460 * ease(clamp(p.sleeve));
  sleeve.visible = p.sleeve < 0.92;
  logoNova.visible = p.logo < 0.5;
  if (logoClient) {
    logoClient.visible = p.logo >= 0.5;
    logoClient.position.y = p.logo >= 0.5 ? base.clientY + 1.9 : base.clientY;
  }
  sweets.position.y = base.sweetsY + 70 * ease(clamp((p.sweets - 0.3) / 0.7));
}

addEventListener('pointermove', (e) => {
  pointer.x = e.clientX / innerWidth - 0.5;
  pointer.y = e.clientY / innerHeight - 0.5;
}, { passive: true });

async function loadRuntime() {
  for (const url of RUNTIME_URLS) {
    try { return (await import(url)).Application; } catch (e) { /* try next CDN */ }
  }
  throw new Error('Spline runtime unavailable');
}

async function init() {
  requestAnimationFrame(frame);
  const failTimer = setTimeout(() => layer.classList.add('fallback'), 9000);
  try {
    const Application = await loadRuntime();
    const app = new Application(canvas);
    await app.load(SCENE_URL);
    try { app.setBackgroundColor('rgba(0,0,0,0)'); } catch (e) { /* keep scene background */ }
    const floor = app.findObjectByName('Shadow Floor');
    if (floor) floor.visible = false;
    const f = (n) => app.findObjectByName(n);
    const box = f('Box'), hinge = f('Lid-Hinge'), sleeve = f('Sleeve');
    const logoNova = f('Logo-NOVA'), logoClient = f('Logo-Client'), sweets = f('Sweets');
    if (!box || !hinge || !sleeve || !logoNova || !sweets) throw new Error('Scene objects missing');
    objs = {
      box, hinge, sleeve, logoNova, logoClient, sweets,
      base: {
        boxRotY: box.rotation.y, boxRotX: box.rotation.x,
        hingeRotX: hinge.rotation.x, sleeveX: sleeve.position.x, sweetsY: sweets.position.y,
        clientY: logoClient ? logoClient.position.y : 0,
      },
    };
    app.setZoom(parseFloat(layer.dataset.zoom || (innerWidth < 640 ? '0.7' : '0.72')));
    clearTimeout(failTimer);
    layer.classList.remove('fallback');
    window.__nova = app; // handy for tuning from the console
    objs.app = app;
  } catch (e) {
    clearTimeout(failTimer);
    layer.classList.add('fallback');
    console.warn('[NOVA box]', e);
  }
}

init();
