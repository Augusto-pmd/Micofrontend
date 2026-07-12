// Mi Container v6 — categorías con opciones reales (Nordelta prices) + Mercado Pago + Google login
// Brand: Roboto · #5ECA00 · #3D3083 · Manual de Marca Junio 2022

const { useState, useEffect, useMemo, useRef, useCallback } = React;

// ─── Mercado Pago API ──────────────────────────────────────────────────────
const MC_API = (typeof location !== 'undefined' && (location.hostname === 'localhost' || location.hostname === '127.0.0.1'))
  ? 'http://127.0.0.1:5001/mc-nordelta-2026/us-central1/api'
  : 'https://us-central1-mc-nordelta-2026.cloudfunctions.net/api';

// Intenta obtener un token Firebase si el usuario está logueado.
// Si no hay sesión activa, devuelve null (guest checkout).
async function _tryGetFirebaseToken() {
  // Usa el Firebase YA cargado en index.html (window._fb). NADA de import() dinámico acá:
  // Babel lo transpila mal y tiraba SIEMPRE → el token nunca llegaba → 401 en el portal.
  try {
    if (window._fb && window._fb.getIdToken) return await window._fb.getIdToken();
    return null;
  } catch {
    return null;
  }
}

// Crea una reserva en el backend.
// Si el usuario está logueado con Firebase, envía el Bearer token.
// Si no, envía los datos del cliente en el body (guest checkout).
async function crearReserva(payload) {
  const token = await _tryGetFirebaseToken();
  const headers = { 'Content-Type': 'application/json' };
  if (token) headers['Authorization'] = `Bearer ${token}`;

  const res = await fetch(`${MC_API}/reservations`, {
    method: 'POST',
    headers,
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || err.detail || `Error ${res.status}`);
  }
  return res.json(); // { reservationId, initPoint }
}

// ─────────────────────────────────────────────────────────────────
// Contacto real (del flyer Mayo 2026)
// ─────────────────────────────────────────────────────────────────
// ─────────────────────────────────────────────────────────────────
// Entidad facturadora
// CORDIS MS SA es la empresa propietaria de la sucursal Nordelta.
// Mi Container opera en su nombre. Las facturas se emiten a nombre
// de CORDIS MS SA.
// ─────────────────────────────────────────────────────────────────
const BILLING_ENTITY = {
  razonSocial: 'CORDIS MS SA',
  domicilio: 'Agustín M. García 10297',
  localidad: 'Benavídez (1621)',
  partido: 'Tigre',
  provincia: 'Buenos Aires',
};

// URL del panel de administración — actualizar cuando se despliege en Vercel
const ADMIN_URL = (typeof location !== 'undefined' && (location.hostname === 'localhost' || location.hostname === '127.0.0.1'))
  ? 'http://localhost:5173'
  : 'https://admin-panel-ten-pied.vercel.app';

const PHONE = '+54 9 11 3620-7989';
const PHONE_TEL = '+5491136207989';
const WHATSAPP = 'https://wa.me/5491136207989';

// ─────────────────────────────────────────────────────────────────
// OAuth Google Client ID — vacío usa demo picker.
// Para producción:
//   console.cloud.google.com → APIs & Services → Credentials
//   OAuth 2.0 Client ID (Web) · origins: https://augusto-pmd.github.io
//   Pegar acá ↓
// ─────────────────────────────────────────────────────────────────
const GOOGLE_CLIENT_ID = '';

// ─────────────────────────────────────────────────────────────────
// Mercado Pago Public Key — vacío usa flujo demo.
// Para producción:
//   mercadopago.com.ar/developers → Tus integraciones → Crear aplicación
//   Credenciales de producción → Public Key (prefijo APP_USR-...)
//   Pegar acá ↓ (la integración real requiere backend para crear la preference)
// ─────────────────────────────────────────────────────────────────
const MERCADOPAGO_PUBLIC_KEY = 'APP_USR-b2352e9e-d851-455a-9f8e-018254f73ffa';

// ─────────────────────────────────────────────────────────────────
// Categorías con opciones reales (precios de Nordelta · Mayo 2026)
// Cada categoría tiene un rango de m² + opciones específicas con precio
// ─────────────────────────────────────────────────────────────────
const CATEGORIES = [
  {
    key: 'pequeno',
    label: 'Pequeño',
    range: '1,5 – 3 m²',
    blurb: 'Para cajas, una bicicleta o archivo personal.',
    fits: ['20–30 cajas de mudanza', '1 bicicleta', 'Ropa de temporada / archivo'],
    options: [
      { m2: 1.50, monthly: 53550 },
      { m2: 2.00, monthly: 71400 },
      { m2: 3.00, monthly: 88200 },
    ],
  },
  {
    key: 'mediano',
    label: 'Mediano',
    range: '5 – 9 m²',
    blurb: 'Para el contenido completo de un monoambiente.',
    fits: ['Muebles de 1 habitación', '~60 cajas', 'Electros y línea blanca'],
    options: [
      { m2: 5.00, monthly: 139230 },
      { m2: 6.00, monthly: 151200 },
      { m2: 8.00, monthly: 204120 },
      { m2: 9.00, monthly: 207900 },
    ],
  },
  {
    key: 'grande',
    label: 'Grande',
    range: '11 – 13,5 m²',
    blurb: 'Para un departamento de 2 ambientes o stock de negocio.',
    fits: ['Muebles de 2 ambientes', '3–5 pallets', 'Stock e-commerce'],
    options: [
      { m2: 11.25, monthly: 259875 },
      { m2: 13.50, monthly: 283500 },
    ],
  },
  {
    key: 'xl',
    label: 'XL',
    range: '15+ m²',
    blurb: 'Para una casa completa o logística de empresa.',
    fits: ['Casa familiar completa', 'Mercadería por pallet', 'A medida'],
    options: [
      { m2: 15.00, monthly: 441000 },
      { m2: 16.00, monthly: 336000 },
      { m2: 22.00, monthly: 462000 },
    ],
  },
];

const fromPrice = (cat) => Math.min(...cat.options.map((o) => o.monthly));
const maxM2 = (cat) => Math.max(...cat.options.map((o) => o.m2));
const formatM2 = (m2) => m2.toLocaleString('es-AR', { minimumFractionDigits: m2 % 1 === 0 ? 0 : 2 });

const addDays = (days) => {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d.toLocaleDateString('es-AR', { day: 'numeric', month: 'long', year: 'numeric' });
};

const SUCURSALES = [
  { id: 'nordelta', name: 'Nordelta',      hood: 'GBA Norte', address: 'Av. de los Lagos 7250', hours: 'Lun–Vie 8–17 hs · Sáb 9–13 hs', availability: 'Alta', scarcity: null, comingSoon: false },
  { id: 'vlopez',  name: 'Vicente López', hood: 'GBA Norte', address: 'Av. Maipú 2840',        hours: 'Próximamente',                   availability: null,   scarcity: null, comingSoon: true  },
];

const ADDONS = [
  { key: 'pickup',   name: 'Retiro a domicilio',  desc: 'Vamos a buscar tus cosas (CABA y GBA).', cost: 32500 },
  { key: 'pack',     name: 'Kit de embalaje',     desc: 'Cajas, cinta y film stretch para 10 m³.', cost: 14500 },
  { key: 'lock',     name: 'Candado certificado', desc: 'De acero, anti-corte. Lo dejás vos.',     cost: 9200  },
  { key: 'insure',   name: 'Seguro extendido',    desc: 'Cobertura hasta $2.000.000 por daños.',   cost: 8900  },
];

// ─────────────────────────────────────────────────────────────────
// PROMOS — sistema dinámico
//
// ESTRATEGIA: las promos son herramientas de captación/retención.
// No más de 1 promo de adquisición activa a la vez — si se apilan
// se pierde impacto y se "quema" el arsenal antes de necesitarlo.
//
// Orden sugerido de despliegue:
//   1. Primer mes gratis     → captación base (exit-intent)
//   2. Mudanza gratis 10m²   → alternativa al primer mes (activar cuando el 1° pierda impacto)
//   3. 20% off anual         → siempre disponible (incentiva compromiso, no es regalo puro)
//   4. Promo temporal (ej. Black Friday) → placements: ['banner','auto-apply','exit-intent']
//
// Para activar una promo: active: true
// Para desactivarla sin borrarla: active: false
//
// Cada promo tiene:
//   active: si está habilitada por marketing (toggle global)
//   placements: dónde puede aparecer:
//     - 'banner'       — strip público arriba de la home
//     - 'size-badge'   — badge sobre las cards de tamaño (filtra por eligible)
//     - 'auto-apply'   — se aplica automáticamente si cumple condiciones
//     - 'exit-intent'  — solo aparece en el modal de retención al cerrar wizard
//     - 'duration-hint'— card highlight en el paso "duración" del wizard
//
// Para que una promo aparezca, marketing tiene que ponerla active + agregar
// el placement donde la quiere. Una promo "tranquila" solo en exit-intent
// no se ve en ningún lado hasta que el cliente intenta irse.
//
// Para lanzar una promo pública (ej. Black Friday): poner active: true +
// placements: ['banner', 'size-badge', 'auto-apply', 'exit-intent']
// ─────────────────────────────────────────────────────────────────
const PROMOS = [
  {
    key: 'first-month-free',
    active: false,
    placements: ['auto-apply'],    // DESACTIVADA — sin promo de 1° mes gratis
    badge: '1° mes gratis',
    name: 'Primer mes gratis',
    description: 'Tu primer mes sin cargo para que te acomodes sin presión.',
    color: 'green',
    bannerOrder: 0,
    eligible: () => true,
    apply: (t) => ({ ...t, monthlyDiscount: t.monthly }),
  },
  {
    key: 'free-pickup-10m2',
    active: false,                                // RESERVADA — alternativa al primer mes gratis
    placements: ['auto-apply', 'size-badge'],
    badge: 'Mudanza gratis',
    name: 'Mudanza gratis desde 10 m²',
    description: 'Retiro a domicilio bonificado al alquilar 10 m² o más.',
    color: 'violet',
    bannerOrder: 1,
    eligible: (d) => (d.option?.m2 ?? maxM2(d.category)) >= 10 && d.addons.includes('pickup'),
    apply: (t) => ({ ...t, pickupDiscount: ADDONS.find((a) => a.key === 'pickup').cost }),
  },
  {
    key: 'annual-20',
    active: true,
    placements: ['auto-apply', 'duration-hint'],  // hint cuando elegís 12+ meses
    badge: '20% off anual',
    name: '20% off al pagar anual',
    description: 'Pagás 12 meses por adelantado y te ahorrás un 20%.',
    color: 'green',
    bannerOrder: 2,
    eligible: (d) => d.duration >= 12,
    apply: (t) => ({ ...t, annualPctOff: 0.2 }),
  },
];

// Unlocking — promos solo accesibles vía exit-intent quedan "desbloqueadas"
// por sesión cuando el cliente acepta. Persistido en sessionStorage.
function hasUnlocked(key) {
  try { return JSON.parse(sessionStorage.getItem('mc.unlocked') || '[]').includes(key); }
  catch { return false; }
}
function unlockPromo(key) {
  try {
    const arr = JSON.parse(sessionStorage.getItem('mc.unlocked') || '[]');
    if (!arr.includes(key)) {
      arr.push(key);
      sessionStorage.setItem('mc.unlocked', JSON.stringify(arr));
      window.dispatchEvent(new Event('mc:unlocked-change'));
    }
  } catch {}
}

// Active promos = active + eligible + (auto-apply OR unlocked-via-exit-intent)
function activePromos(data) {
  return PROMOS.filter((p) => {
    if (!p.active) return false;
    if (!p.eligible(data)) return false;
    const pls = p.placements || [];
    if (pls.includes('auto-apply')) return true;
    if (pls.includes('exit-intent') && hasUnlocked(p.key)) return true;
    return false;
  });
}

// Promos visibles para un placement específico (banner, size-badge, etc.)
function promosForPlacement(placement, data = null) {
  return PROMOS.filter((p) => {
    if (!p.active) return false;
    if (!(p.placements || []).includes(placement)) return false;
    if (data && !p.eligible(data)) return false;
    return true;
  });
}

function computeTotals(data) {
  const monthly = data.option?.monthly ?? fromPrice(data.category);
  const addonOneOff = data.addons
    .filter((k) => k !== 'pickup')
    .reduce((s, k) => s + ADDONS.find((a) => a.key === k).cost, 0);
  const pickupCost = data.addons.includes('pickup') ? ADDONS.find((a) => a.key === 'pickup').cost : 0;

  let t = { monthly, monthlyDiscount: 0, pickupCost, pickupDiscount: 0, addonOneOff, annualPctOff: 0 };
  activePromos(data).forEach((p) => { t = p.apply(t); });

  const monthlyEff = Math.max(0, t.monthly - t.monthlyDiscount);
  const pickupEff = Math.max(0, t.pickupCost - t.pickupDiscount);
  const firstMonth = monthlyEff + pickupEff + t.addonOneOff;

  return { ...t, monthlyEff, pickupEff, firstMonth };
}

/* ════════════════════════════════════════════════════════════════ */
/* Store                                                              */
/* ════════════════════════════════════════════════════════════════ */
const store = {
  getUser() { try { return JSON.parse(localStorage.getItem('mc.user') || 'null'); } catch { return null; } },
  setUser(user) {
    if (user) localStorage.setItem('mc.user', JSON.stringify(user));
    else localStorage.removeItem('mc.user');
    window.dispatchEvent(new Event('mc:user-change'));
  },
  getReservations() { try { return JSON.parse(localStorage.getItem('mc.reservations') || '[]'); } catch { return []; } },
  addReservation(r) {
    const all = store.getReservations();
    all.unshift(r);
    localStorage.setItem('mc.reservations', JSON.stringify(all));
    window.dispatchEvent(new Event('mc:reservations-change'));
  },
  updateReservation(id, patch) {
    const all = store.getReservations().map((r) => r.id === id ? { ...r, ...patch } : r);
    localStorage.setItem('mc.reservations', JSON.stringify(all));
    window.dispatchEvent(new Event('mc:reservations-change'));
  },
  isPromoDismissed() { return localStorage.getItem('mc.promo-dismissed') === '1'; },
  dismissPromo() { localStorage.setItem('mc.promo-dismissed', '1'); window.dispatchEvent(new Event('mc:promo-change')); },
};

function generateCode() {
  const part = () => Math.random().toString(36).slice(2, 6).toUpperCase();
  return `MC-${part()}-${part()}`;
}

/* ════════════════════════════════════════════════════════════════ */
/* Routing + reveal                                                   */
/* ════════════════════════════════════════════════════════════════ */
function useHashRoute() {
  const parse = () => {
    const raw = window.location.hash.replace(/^#/, '').replace(/^\//, '');
    if (!raw) return { name: 'home', params: {} };
    const segs = raw.split('/').filter(Boolean);
    if (segs[0] === 'portal' && segs[1] === 'r' && segs[2] && segs[3] === 'acceso')
      return { name: 'reservation', params: { id: segs[2], view: 'acceso' } };
    if (segs[0] === 'portal' && segs[1] === 'r' && segs[2] && segs[3] === 'cambiar')
      return { name: 'reservation', params: { id: segs[2], view: 'cambiar' } };
    if (segs[0] === 'portal' && segs[1] === 'r' && segs[2])
      return { name: 'reservation', params: { id: segs[2], view: null } };
    if (segs[0] === 'portal') return { name: 'portal', params: {} };
    if (segs[0] === 'reservar') return { name: 'home', params: {}, openWizard: true };
    return { name: 'home', params: {} };
  };
  const [route, setRoute] = useState(parse);
  useEffect(() => {
    const onChange = () => setRoute(parse());
    window.addEventListener('hashchange', onChange);
    return () => window.removeEventListener('hashchange', onChange);
  }, []);
  return route;
}

// Animates a number from 0 to `target` when the element scrolls into view
function useCountUp(target, { duration = 1000, decimals = 0, startDelay = 0 } = {}) {
  const [count, setCount] = useState(0);
  const [started, setStarted] = useState(false);
  const ref = useRef(null);
  useEffect(() => {
    const el = ref.current;
    if (!el || !('IntersectionObserver' in window)) { setCount(target); return; }
    const io = new IntersectionObserver(([e]) => {
      if (e.isIntersecting) { io.disconnect(); setTimeout(() => setStarted(true), startDelay); }
    }, { threshold: 0.5 });
    io.observe(el);
    return () => io.disconnect();
  }, []);
  useEffect(() => {
    if (!started) return;
    const start = performance.now();
    const tick = (now) => {
      const p = Math.min((now - start) / duration, 1);
      const eased = 1 - Math.pow(1 - p, 3); // ease-out cubic
      const val = eased * target;
      setCount(decimals > 0 ? Math.round(val * 10 ** decimals) / 10 ** decimals : Math.round(val));
      if (p < 1) requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  }, [started]);
  return { count, ref };
}

function useReveal(deps = []) {
  useEffect(() => {
    const els = document.querySelectorAll('[data-reveal]');
    if (!('IntersectionObserver' in window)) { els.forEach((el) => el.classList.add('in')); return; }
    const io = new IntersectionObserver(
      (entries) => entries.forEach((e) => { if (e.isIntersecting) { e.target.classList.add('in'); io.unobserve(e.target); } }),
      { threshold: 0.18, rootMargin: '0px 0px -40px 0px' }
    );
    els.forEach((el) => io.observe(el));
    return () => io.disconnect();
  }, deps);
}

/* ════════════════════════════════════════════════════════════════ */
/* Brand atoms                                                        */
/* ════════════════════════════════════════════════════════════════ */
// Componente del logo: usa el PNG oficial si existe en assets/logo-mark.png,
// fallback al SVG si no está disponible.
function Isologo({ size = 36 }) {
  const [useSvg, setUseSvg] = React.useState(false);

  if (!useSvg) {
    return (
      <img
        src="assets/logo-mark.png"
        alt=""
        width={size}
        height={size}
        style={{ display: 'block', objectFit: 'contain' }}
        onError={() => setUseSvg(true)}
        aria-hidden="true"
      />
    );
  }

  // SVG fallback (mientras no esté el PNG)
  return (
    <svg viewBox="0 0 37 37" width={size} height={size} aria-hidden="true">
      <rect x="2" y="2"  width="22" height="22" rx="1" fill="white"/>
      <rect x="13" y="13" width="22" height="22" rx="1" fill="white"/>
      <rect x="13" y="13" width="11" height="11" fill="#5ECA00"/>
      <path d="M16.5 18.5 L16.5 16 A2 2 0 0 0 20.5 16 L20.5 18.5" stroke="#0a0a0a" strokeWidth="1.6" fill="none" strokeLinecap="round"/>
      <rect x="15.5" y="18" width="6" height="4" rx="0.5" fill="#0a0a0a"/>
      <rect x="2" y="2"  width="22" height="22" rx="1" fill="none" stroke="#0a0a0a" strokeWidth="2.6"/>
      <rect x="13" y="13" width="22" height="22" rx="1" fill="none" stroke="#0a0a0a" strokeWidth="2.6"/>
    </svg>
  );
}

function MercadoPagoLogo({ size = 18 }) {
  // Logo oficial Mercado Pago (SVG paths del sitio oficial)
  const h = size;
  const w = Math.round(size * 3.6);
  return (
    <svg viewBox="0 0 110 30" width={w} height={h} aria-hidden="true" xmlns="http://www.w3.org/2000/svg">
      {/* Círculo azul con apretón de manos oficial */}
      <circle cx="15" cy="15" r="14" fill="#009ee3"/>
      <path d="M8.5 18.5c-.4-1.1-.1-2.3.7-3.3.5-.6 1-1.1 1.6-1.4C11.4 12.5 13 11.5 15 11.5c1.7 0 2.9.6 3.8 1.5l1.2-1.2c1-1 2.3-1.5 3.5-1.3-.6 1.5-1.5 2.7-2.8 3.4.7 1 1.1 2.1 1 3.3-1.7.4-3.4.1-4.7-1L15.5 17.6c-1.1 1-2.5 1.7-4 1.7-1.8 0-3.4-.9-4-2.8z" fill="#fff"/>
      {/* Wordmark "mercado pago" oficial */}
      <text x="34" y="13" fontFamily="'Helvetica Neue',Arial,sans-serif" fontWeight="700" fontSize="10" fill="#009ee3" letterSpacing="0.3">mercado</text>
      <text x="34" y="25" fontFamily="'Helvetica Neue',Arial,sans-serif" fontWeight="700" fontSize="10" fill="#002f9b" letterSpacing="0.3">pago</text>
    </svg>
  );
}

/* ════════════════════════════════════════════════════════════════ */
/* Promo banner                                                       */
/* ════════════════════════════════════════════════════════════════ */
// Banner público — solo si marketing puso una promo con placement: 'banner'.
// Por defecto NO se ve. Marketing lo enciende editando PROMOS.
function PromoBanner() {
  const [dismissed, setDismissed] = useState(store.isPromoDismissed());
  useEffect(() => {
    const onChange = () => setDismissed(store.isPromoDismissed());
    window.addEventListener('mc:promo-change', onChange);
    return () => window.removeEventListener('mc:promo-change', onChange);
  }, []);
  const featured = promosForPlacement('banner').sort((a, b) => a.bannerOrder - b.bannerOrder).slice(0, 3);
  if (dismissed || featured.length === 0) return null;
  return (
    <div className="mc-promo-strip" role="region" aria-label="Promociones vigentes">
      <div className="mc-promo-strip-inner">
        <div className="mc-promo-strip-list">
          {featured.map((p) => (
            <span key={p.key} className={`mc-promo-pill ${p.color}`}>
              <span className="lbl">{p.badge}</span>
              <span className="dsc">{p.description}</span>
            </span>
          ))}
        </div>
        <button className="mc-promo-close" onClick={() => { store.dismissPromo(); setDismissed(true); }} aria-label="Cerrar promociones">
          <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M6 6l12 12M18 6L6 18" /></svg>
        </button>
      </div>
    </div>
  );
}

/* ════════════════════════════════════════════════════════════════ */
/* ExitIntent — retention modal cuando intentás cerrar el wizard      */
/* Aplica psicología: reciprocidad, loss aversion, anchoring          */
/* ════════════════════════════════════════════════════════════════ */
function ExitIntent({ promo, data, onAccept, onDecline }) {
  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onDecline(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onDecline]);

  if (!promo) return null;

  // Anchored visual: si el promo descuenta la mensualidad, mostramos el "antes" y "ahora"
  const monthlyBase = data?.option?.monthly ?? 0;
  const isFirstMonthFree = promo.key === 'first-month-free';

  return (
    <div className="mc-exit-back" onClick={onDecline} role="dialog" aria-modal="true" aria-labelledby="exit-title">
      <div className="mc-exit" onClick={(e) => e.stopPropagation()}>
        <button className="mc-exit-close" onClick={onDecline} aria-label="Cerrar">
          <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M6 6l12 12M18 6L6 18" /></svg>
        </button>

        <span className="mc-exit-eyebrow">Antes de irte ↓</span>
        <h2 id="exit-title">¿Necesitás <span className="g">una mano</span>?</h2>
        <p>Sabemos que arrancar cuesta. Te regalamos el <b>primer mes</b> para que te acomodes — sin condiciones, sin tarjeta hasta confirmar.</p>

        {isFirstMonthFree && monthlyBase > 0 && (
          <div className="mc-exit-visual">
            <div className="anchor">
              <span className="lbl">Primer mes</span>
              <div className="prices">
                <span className="before">${monthlyBase.toLocaleString('es-AR')}</span>
                <span className="arr">→</span>
                <span className="after">$0</span>
              </div>
            </div>
            <div className="save">Te ahorrás <b>${monthlyBase.toLocaleString('es-AR')}</b> hoy</div>
          </div>
        )}

        <div className="mc-exit-actions">
          <button className="mc-btn mc-btn-green big" onClick={() => onAccept(promo)}>
            <span>Aprovecho y sigo</span>
            <span className="arrow">→</span>
          </button>
          <button className="mc-exit-no" onClick={onDecline}>Otra vez será</button>
        </div>

        <div className="mc-exit-trust">
          <span>· Sin tarjeta hasta que confirmes</span>
          <span>· Cancelás cuando quieras</span>
          <span>· Sin permanencia mínima</span>
        </div>
      </div>
    </div>
  );
}

/* ════════════════════════════════════════════════════════════════ */
/* Nav                                                                */
/* ════════════════════════════════════════════════════════════════ */
function Nav({ onReserve, route, user }) {
  const [scrolled, setScrolled] = useState(false);
  const [open, setOpen] = useState(false);
  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 24);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);
  const goSection = (id) => {
    if (route.name !== 'home') {
      window.location.hash = '#/';
      setTimeout(() => document.getElementById(id)?.scrollIntoView({ behavior: 'smooth' }), 60);
    } else {
      document.getElementById(id)?.scrollIntoView({ behavior: 'smooth' });
    }
    setOpen(false);
  };
  return (
    <header className={`mc-nav ${scrolled ? 'is-scrolled' : ''}`}>
      <div className="mc-nav-inner">
        <a className="mc-logo" href="#/" aria-label="Mi Container — inicio">
          <span className="mc-logo-mark"><Isologo size={36} /></span>
          <span className="mc-logo-type"><span className="mi">Mi</span><b>CONTAINER</b></span>
        </a>
        <nav className={`mc-links ${open ? 'open' : ''}`} aria-label="Principal">
          <a onClick={() => goSection('sucursales')}>Sucursales</a>
          <a onClick={() => goSection('sizes')}>Espacios</a>
          <a onClick={() => goSection('how')}>Cómo funciona</a>
          <a onClick={() => goSection('faq')}>Preguntas</a>
        </nav>
        <div className="mc-nav-right">
          <a className="mc-nav-phone" href={`tel:${PHONE_TEL}`}>{PHONE}</a>
          <a className="mc-nav-portal" href="#/portal">
            <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2" />
              <circle cx="12" cy="7" r="4" />
            </svg>
            <span className="lbl">{user ? 'Mi cuenta' : 'Acceso clientes'}</span>
          </a>
          <button className="mc-btn mc-btn-primary" onClick={onReserve}>
            <span>Reservar</span>
            <span className="arrow">→</span>
          </button>
          <button className={`mc-burger ${open ? 'open' : ''}`} onClick={() => setOpen(!open)} aria-label={open ? 'Cerrar menú' : 'Abrir menú'} aria-expanded={open}>
            <span /><span /><span />
          </button>
        </div>
      </div>
    </header>
  );
}

/* ════════════════════════════════════════════════════════════════ */
/* Hero — "Guardá lo que querés"                                     */
/* ════════════════════════════════════════════════════════════════ */
function Hero({ onReserve }) {
  return (
    <section className="mc-hero mc-container" id="top">
      <div className="mc-hero-meta" data-reveal>
        <span className="pill"><span className="dot" />Nordelta · GBA Norte · Lun a Sáb</span>
        <span>Próximamente Vicente López</span>
      </div>

      <h1 className="mc-hero-title">
        <span className="line"><span className="reveal">Guardá</span></span>
        <span className="line">
          <span className="reveal">
            <span className="img-inline" aria-hidden="true"><img src="assets/hero-box.webp" alt="" /></span>{' '}
            <span className="v">lo que</span>
          </span>
        </span>
        <span className="line"><span className="reveal"><span className="g">querés</span>.</span></span>
      </h1>

      <div className="mc-hero-grid" data-reveal>
        <p className="mc-hero-lead">
          Alquilá un espacio para guardar tus cosas en Buenos Aires. Reservá en 5 minutos, pagás mensual con tarjeta y accedés con reconocimiento facial — todo online, sin llamar a nadie.
        </p>
        <div className="mc-hero-actions">
          <div className="row">
            <button className="mc-btn mc-btn-green big" onClick={onReserve}>
              <span>Reservá tu espacio</span>
              <span className="arrow">→</span>
            </button>
            <a className="mc-btn mc-btn-ghost-violet" href="#/portal">
              <span>Acceso clientes</span>
              <span className="arrow">→</span>
            </a>
          </div>
          <span className="micro">5 min · sin depósito · sin permanencia</span>
        </div>
      </div>

    </section>
  );
}

/* ════════════════════════════════════════════════════════════════ */
/* Sucursales                                                         */
/* ════════════════════════════════════════════════════════════════ */
function Sucursales({ onReserve }) {
  return (
    <section className="mc-sucs-strip mc-container" id="sucursales" data-reveal>
      <div className="mc-sucs-strip-head">
        <span className="mc-eyebrow violet" style={{ marginBottom: 0 }}>Nordelta · GBA Norte · Lun a Sáb</span>
      </div>
      <div className="mc-sucs-strip-list">
        {SUCURSALES.map((s) => (
          s.comingSoon
            ? (
              <div key={s.id} className="mc-suc-pill coming-soon">
                <span className="name">{s.name}</span>
                <span className="detail">{s.hood} · {s.address}</span>
                <span className="badge coming">Próximamente</span>
              </div>
            )
            : (
              <button key={s.id} className={`mc-suc-pill alta`} onClick={() => onReserve(s)}>
                <span className="name">{s.name}</span>
                <span className="detail">{s.hood} · {s.address}</span>
                <span className="badge avail-alta">{s.availability}</span>
              </button>
            )
        ))}
      </div>
    </section>
  );
}

/* ════════════════════════════════════════════════════════════════ */
/* Ticker                                                             */
/* ════════════════════════════════════════════════════════════════ */
function Ticker() {
  const items = ['Sin depósito', 'Sin permanencia', '20% off anual', 'Acceso Lun a Sáb', 'Pagás con Mercado Pago', 'Gestión online'];
  const run = [...items, ...items, ...items];
  return (
    <div className="mc-ticker" aria-hidden="true">
      <div className="mc-ticker-track">
        {run.map((it, i) => (<span key={i} className="mc-ticker-item"><span className="dot" /> {it}</span>))}
      </div>
    </div>
  );
}

/* ════════════════════════════════════════════════════════════════ */
/* Categorías (home) — con rangos + "desde" + opciones                */
/* ════════════════════════════════════════════════════════════════ */
function Categorias({ onReserveCategory }) {
  return (
    <section className="mc-sizes mc-container" id="sizes">
      <div className="mc-sec-head" data-reveal>
        <span className="mc-eyebrow green">Espacios y precios</span>
        <h2>Cuatro categorías,<br /><span className="g">precios reales</span>.</h2>
        <p>Mes a mes, con IVA incluido. Precios de sucursal Nordelta.</p>
      </div>

      <div className="mc-cat-list" data-reveal>
        {CATEGORIES.map((c, i) => {
          const testData = { category: c, option: c.options[c.options.length - 1], duration: 12, addons: ['pickup'] };
          const eligible = promosForPlacement('size-badge', testData);
          return (
            <article
              key={c.key}
              className="mc-cat-row"
              role="button"
              tabIndex={0}
              onClick={() => onReserveCategory(c)}
              onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onReserveCategory(c); } }}
            >
              <div className="mc-cat-row-num">0{i + 1}</div>
              <div className="mc-cat-row-name">
                <h3>{c.label}</h3>
                <span className="range">{c.range}</span>
              </div>
              <div className="mc-cat-row-blurb">
                <p>{c.blurb}</p>
                {eligible.length > 0 && (
                  <div className="badges">
                    {eligible.map((p) => <span key={p.key} className={`mc-promo-badge ${p.color}`}>{p.badge}</span>)}
                  </div>
                )}
              </div>
              <div className="mc-cat-row-price">
                <span className="from">Desde</span>
                <b>${fromPrice(c).toLocaleString('es-AR')}</b>
                <span className="unit">/ mes</span>
              </div>
              <div className="mc-cat-row-go" aria-hidden="true">→</div>
            </article>
          );
        })}
      </div>
    </section>
  );
}

/* ════════════════════════════════════════════════════════════════ */
/* How                                                                */
/* ════════════════════════════════════════════════════════════════ */
function How() {
  const steps = [
    { n: '01', t: 'Elegí tamaño y fecha', d: 'Nordelta, GBA Norte. Cuatro categorías con opciones reales en m².' },
    { n: '02', t: 'Suscribite con tarjeta',  d: 'Mercado Pago, mensualidad automática. Cinco minutos. Sin depósito.' },
    { n: '03', t: 'Gestionás desde tu cuenta', d: 'Pagos, accesos, facturación — todo en el portal. El acceso es por reconocimiento facial.' },
  ];
  return (
    <section className="mc-how" id="how">
      <img
        id="how-box-img"
        src="assets/box-render.png"
        alt="Cómo funciona Mi Container"
        className="mc-how-box-img"
      />
    </section>
  );
}

/* ════════════════════════════════════════════════════════════════ */
/* Guarantees                                                         */
/* ════════════════════════════════════════════════════════════════ */
function Guarantees({ onReserve }) {
  return (
    <section className="mc-guard mc-container">
      <div className="mc-sec-head" data-reveal>
        <span className="mc-eyebrow green">Lo que te prometemos</span>
        <h2><span className="g">Cuatro cosas</span><br />que nunca van a cambiar.</h2>
      </div>
      <div className="mc-bento">
        <article className="mc-bento-item mc-bento-1" data-reveal>
          <span className="icon" aria-hidden="true">
            <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M4 7l1.5 12.5a2 2 0 002 1.75h9a2 2 0 002-1.75L20 7" />
              <path d="M9 7V5a3 3 0 016 0v2" />
            </svg>
          </span>
          <span className="n">01 / Garantía</span>
          <h3>Sin <span className="g">depósito</span>,<br />sin permanencia.</h3>
          <p>Arrancás con el primer mes y ya. Cancelás con 7 días de aviso, sin penalidades ni cargos ocultos.</p>
        </article>
        <article className="mc-bento-item mc-bento-2" data-reveal="2">
          <span className="n">02 / Acceso</span>
          <h3>Acceso con tu credencial</h3>
          <p>Entrás con reconocimiento facial en el horario del local: Lun a Vie 8–17 hs · Sáb 9–13 hs.</p>
        </article>
        <article className="mc-bento-item mc-bento-3" data-reveal="3">
          <span className="n">03 / Seguridad</span>
          <h3>Vigilancia activa</h3>
          <p>Cámaras 24/7, control biométrico y monitoreo presencial en cada acceso.</p>
        </article>
        <article className="mc-bento-item mc-bento-4" data-reveal="2">
          <span className="n">04 / Bonus</span>
          <h3>Coworking incluido</h3>
          <p>Escritorio y sala de reuniones sin cargo extra mientras alquilás un espacio.</p>
          <div className="figure">$0</div>
          <div className="figure-sub">Costo adicional</div>
        </article>
        <article className="mc-bento-item mc-bento-5" data-reveal="3">
          <div>
            <h3>¿Listo para guardar?</h3>
            <p>Reservá online en cinco minutos. Firmás el contrato una sola vez al llegar.</p>
          </div>
          <button className="mc-btn mc-btn-green" onClick={onReserve}>
            <span>Reservar ahora</span>
            <span className="arrow">→</span>
          </button>
        </article>
      </div>
    </section>
  );
}

/* ════════════════════════════════════════════════════════════════ */
/* SelfService                                                        */
/* ════════════════════════════════════════════════════════════════ */
function SelfService({ onReserve }) {
  return (
    <section className="mc-self mc-container">
      <div className="mc-sec-head" data-reveal>
        <span className="mc-eyebrow violet">Empresa autogestiva</span>
        <h2>Vos manejás <span className="v">tu espacio</span>.<br />Nosotros, la infraestructura.</h2>
        <p>Reservas, pagos, accesos, facturación, cambios de tamaño — todo desde la web, sin tener que llamar a nadie.</p>
      </div>
      <div className="mc-self-grid">
        <article className="mc-self-card mc-self-reserve" data-reveal>
          <span className="mc-eyebrow on-dark">Reserva online</span>
          <h3>Conseguí tu espacio en 5 minutos.</h3>
          <ul>
            <li>Elegís sucursal, tamaño exacto en m² y add-ons</li>
            <li>Suscripción mensual con tarjeta de crédito vía Mercado Pago</li>
            <li>Registrás tu cara una vez desde el portal</li>
            <li>Contrato físico una sola vez, al llegar</li>
          </ul>
          <button className="mc-btn mc-btn-green" onClick={onReserve}>
            <span>Empezar reserva</span>
            <span className="arrow">→</span>
          </button>
        </article>
        <article className="mc-self-card mc-self-portal" data-reveal="2">
          <span className="mc-eyebrow on-dark">Portal cliente</span>
          <h3>Gestioná todo desde tu cuenta.</h3>
          <ul>
            <li>Múltiples reservas en distintas sucursales</li>
            <li>Acceso por reconocimiento facial (Lun a Sáb)</li>
            <li>Cambiar de tamaño con un click</li>
            <li>Pausar o cancelar cuando quieras</li>
          </ul>
          <a className="mc-btn mc-btn-violet" href="#/portal">
            <span>Entrar al portal</span>
            <span className="arrow">→</span>
          </a>
        </article>
      </div>
    </section>
  );
}

/* ════════════════════════════════════════════════════════════════ */
/* Testimonials + FAQ + BigCTA + Footer                               */
/* ════════════════════════════════════════════════════════════════ */
function Testimonials() {
  return (
    <section className="mc-testi mc-container">
      <div className="mc-sec-head" data-reveal>
        <span className="mc-eyebrow violet">Nos eligen</span>
        <h2>Lo que <span className="v">dicen</span> de Mi Container.</h2>
      </div>
      <div className="mc-testi-grid">
        <figure className="mc-testi-main" data-reveal>
          <div className="stars" aria-label="5 estrellas">★★★★★</div>
          <blockquote>Lo contraté un miércoles y el jueves ya había mudado medio depósito. Cero vueltas, cero letra chica. Es lo más cercano a "mudarte sin mudarte" que probé.</blockquote>
          <figcaption><span className="avatar">JM</span><div><b>Julia M.</b><span>Fundadora · Tienda online</span></div></figcaption>
        </figure>
        <div className="mc-testi-side">
          <figure data-reveal="2">
            <div className="stars" aria-label="5 estrellas">★★★★★</div>
            <blockquote>Tengo dos boxes en Nordelta. Guardo mercadería y muestras por separado. Los manejo desde la misma cuenta.</blockquote>
            <figcaption><span className="avatar">TR</span><div><b>Tomás R.</b><span>PyME · Importación</span></div></figcaption>
          </figure>
          <figure data-reveal="3">
            <div className="stars" aria-label="5 estrellas">★★★★★</div>
            <blockquote>Reservé en 5 minutos y pagué todo por Mercado Pago, sin trámites ni depósito.</blockquote>
            <figcaption><span className="avatar">CP</span><div><b>Carla P.</b><span>Particular</span></div></figcaption>
          </figure>
        </div>
      </div>
    </section>
  );
}

function FAQ() {
  const [open, setOpen] = useState(0);
  const qa = [
    { q: '¿Necesito firmar un contrato?', a: 'Sí, pero una sola vez: firmás el contrato físico la primera vez que venís. Después todo es online — pagos, accesos y cancelación cuando quieras, sin permanencia mínima.' },
    { q: '¿Puedo tener más de un box?',          a: 'Sí. Podés tener tantas reservas como necesites, incluso en distintas sucursales. Las manejás todas desde la misma cuenta.' },
    { q: '¿Cómo pago?',                          a: 'Suscripción mensual con tarjeta de crédito a través de Mercado Pago. Te cobramos automáticamente cada mes mientras tu cuenta esté activa. Cancelás cuando quieras desde el portal. Los precios incluyen IVA.' },
    { q: '¿Cómo accedo al box?',                 a: 'Con reconocimiento facial. Subís una selfie desde el portal, el sistema registra tu cara y desde ese momento entrás mirando la cámara de la entrada. Sin turno, sin tarjeta, sin nada. Funciona en el horario del local: Lun a Vie 8–17 hs y Sáb 9–13 hs.' },
    { q: '¿Cómo aplican las promos?',            a: 'Se aplican automáticamente al hacer la reserva si cumplís los requisitos. Por ejemplo, el 20% off al contratar 12 meses.' },
    { q: '¿Puedo cambiar de tamaño después?',    a: 'Sí. Desde el portal cambiás de tamaño sin penalidad. Si crece tu necesidad o si querés achicar, lo hacés con un click.' },
    { q: '¿Qué no puedo guardar?',               a: 'Materiales inflamables, tóxicos, alimentos perecederos, seres vivos y productos ilegales. El resto, todo.' },
  ];
  return (
    <section className="mc-faq mc-container" id="faq">
      <div className="mc-faq-head" data-reveal>
        <span className="mc-eyebrow green">Preguntas frecuentes</span>
        <h2>Dudas que <span className="v">siempre</span><br />nos hacen.</h2>
        <p>¿Tenés otra? Escribinos por WhatsApp o desde el portal.</p>
      </div>
      <div className="mc-faq-list" data-reveal>
        {qa.map((it, i) => (
          <div key={i} className={`mc-faq-item ${open === i ? 'open' : ''}`}>
            <button className="mc-faq-q" onClick={() => setOpen(open === i ? -1 : i)} aria-expanded={open === i}>
              <h3>{it.q}</h3>
              <span className="mc-faq-chev" aria-hidden="true">
                <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M6 9l6 6 6-6" /></svg>
              </span>
            </button>
            <div className="mc-faq-a"><p>{it.a}</p></div>
          </div>
        ))}
      </div>
    </section>
  );
}

function BigCTA({ onReserve }) {
  return (
    <section className="mc-bigcta" data-reveal>
      <div className="mc-bigcta-inner">
        <h2><span>Guardá lo que</span><span>querés.</span></h2>
        <div className="mc-bigcta-actions">
          <button className="mc-btn mc-btn-green big" onClick={onReserve}>
            <span>Elegí tu espacio</span>
            <span className="arrow">→</span>
          </button>
          <div className="mc-bigcta-phone">
            <small>o llamanos</small>
            <b><a href={`tel:${PHONE_TEL}`} style={{ color: 'inherit' }}>{PHONE}</a></b>
          </div>
        </div>
        <div className="mc-bigcta-foot">
          <span>MiContainer · BsAs · 2026</span>
          <span>Guardá lo que querés</span>
        </div>
      </div>
    </section>
  );
}

function Footer({ onReserve }) {
  return (
    <footer className="mc-footer">
      <div className="mc-footer-top">
        <div className="mc-footer-brand">
          <a className="mc-logo" href="#/">
            <span className="mc-logo-mark"><Isologo size={36} /></span>
            <span className="mc-logo-type"><span className="mi">Mi</span><b>CONTAINER</b></span>
          </a>
          <p className="tagline"><b>Guardá lo que querés.</b><br />Self-storage flexible en Buenos Aires. Reservá y gestioná todo online.</p>
          <button className="mc-btn mc-btn-primary" onClick={onReserve}>
            <span>Reservá tu espacio</span>
            <span className="arrow">→</span>
          </button>
        </div>
        <div className="mc-footer-cols">
          <div>
            <h5>Producto</h5>
            <a onClick={() => document.getElementById('sucursales')?.scrollIntoView({ behavior: 'smooth' })}>Sucursales</a>
            <a onClick={() => document.getElementById('sizes')?.scrollIntoView({ behavior: 'smooth' })}>Espacios y precios</a>
            <a onClick={() => document.getElementById('how')?.scrollIntoView({ behavior: 'smooth' })}>Cómo funciona</a>
            <a href="#/portal">Portal cliente</a>
          </div>
          <div>
            <h5>Compañía</h5>
            <a onClick={() => document.getElementById('faq')?.scrollIntoView({ behavior: 'smooth' })}>Preguntas</a>
            <a>Nosotros</a>
            <a>Términos y privacidad</a>
          </div>
          <div>
            <h5>Contacto</h5>
            <a href={WHATSAPP} target="_blank" rel="noopener">WhatsApp</a>
            <a href={`tel:${PHONE_TEL}`}>{PHONE}</a>
            <a href="mailto:info@micontainer.com">info@micontainer.com</a>
          </div>
        </div>
      </div>
      <div className="mc-footer-base">
        <span>© 2026 Mi Container · Guardá lo que querés</span>
        <span>Hecho en Buenos Aires</span>
      </div>
    </footer>
  );
}

/* ════════════════════════════════════════════════════════════════ */
/* WIZARD                                                             */
/* ════════════════════════════════════════════════════════════════ */
function Wizard({ initialCategory, initialSucursal, user, onClose }) {
  const [step, setStep] = useState(initialSucursal ? 1 : 0);
  const [paying, setPaying] = useState(false);
  const [exitOpen, setExitOpen] = useState(false);
  const [exitShown, setExitShown] = useState(false);
  const [unlockTick, setUnlockTick] = useState(0);
  useEffect(() => {
    const onChange = () => setUnlockTick((n) => n + 1);
    window.addEventListener('mc:unlocked-change', onChange);
    return () => window.removeEventListener('mc:unlocked-change', onChange);
  }, []);
  const [data, setData] = useState({
    sucursal: initialSucursal || SUCURSALES[0],
    category: initialCategory || CATEGORIES[0],
    option: (initialCategory || CATEGORIES[0]).options[0],
    startDate: '',
    duration: 3,
    mode: 'ahora',   // 'ahora' | 'futuro' (reserva diferida con prioridad)
    addons: [],
    name: user?.name || '',
    email: user?.email || '',
    phone: user?.phone || '',
    dni: user?.dni || '',
    payment: 'mp-recurring',
    clientType: 'persona',   // 'persona' | 'empresa'
    razonSocial: '',
    cuit: '',
  });
  const [errors, setErrors] = useState({});

  // #3: disponibilidad real de stock por m2 (endpoint publico /availability)
  const [availByM2, setAvailByM2] = useState({});
  const [wlEmail, setWlEmail] = useState('');
  const [wlSent, setWlSent] = useState(false);
  useEffect(() => {
    fetch(`${MC_API}/availability`).then((r) => r.json()).then((d) => setAvailByM2(d.byM2 || {})).catch(() => {});
  }, []);
  // si la medida elegida quedo sin stock, saltar a la primera disponible de la categoria
  useEffect(() => {
    const cur = data.option?.m2;
    if (cur != null && (availByM2[String(cur)] ?? 0) > 0) return;
    const firstAvail = data.category?.options?.find((o) => (availByM2[String(o.m2)] ?? 0) > 0);
    if (firstAvail) setOption(firstAvail);
  }, [availByM2, data.category]);

  // Exit-intent: si está intentando cerrar entre steps 1-3 (después de empezar a elegir)
  // y todavía no le ofrecimos retención esta sesión → ofrecer.
  const tryClose = useCallback(() => {
    if (paying || step >= 4) { onClose(); return; }
    if (step >= 1 && !exitShown && !hasUnlocked('first-month-free')) {
      const promo = promosForPlacement('exit-intent')[0];
      if (promo) {
        setExitOpen(true);
        setExitShown(true);
        return;
      }
    }
    onClose();
  }, [step, paying, exitShown, onClose]);

  useEffect(() => {
    document.body.classList.add('mc-wizard-open');
    return () => document.body.classList.remove('mc-wizard-open');
  }, []);

  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape' && step < 5 && !paying) tryClose(); };
    document.addEventListener('keydown', onKey);
    document.body.style.overflow = 'hidden';
    return () => { document.removeEventListener('keydown', onKey); document.body.style.overflow = ''; };
  }, [step, paying, tryClose]);

  const onExitAccept = (promo) => {
    unlockPromo(promo.key);
    setExitOpen(false);
    // Wizard se queda abierto; al recomputar totals, la promo ya está activa.
  };
  const onExitDecline = () => {
    setExitOpen(false);
    onClose();
  };

  const today = useMemo(() => { const d = new Date(); d.setDate(d.getDate() + 1); return d.toISOString().split('T')[0]; }, []);
  const maxAhora = useMemo(() => { const d = new Date(); d.setDate(d.getDate() + 10); return d.toISOString().split('T')[0]; }, []);  // tope 10 dias para "ingreso ahora"
  const minFuturo = useMemo(() => { const d = new Date(); d.setDate(d.getDate() + 11); return d.toISOString().split('T')[0]; }, []);
  useEffect(() => { if (!data.startDate) setData((d) => ({ ...d, startDate: today })); }, [today]);

  const totals = useMemo(() => computeTotals(data), [data, unlockTick]);
  const promos = useMemo(() => activePromos(data), [data, unlockTick]);

  const toggleAddon = (k) => setData((d) => ({
    ...d, addons: d.addons.includes(k) ? d.addons.filter((x) => x !== k) : [...d.addons, k],
  }));

  const setCategory = (c) => setData((d) => ({ ...d, category: c, option: c.options[0] }));
  const setOption   = (o) => setData((d) => ({ ...d, option: o }));

  const validateData = () => {
    const e = {};
    if (data.clientType === 'empresa') {
      if (!data.razonSocial.trim() || data.razonSocial.trim().length < 2) e.razonSocial = 'Ingresá la razón social';
      const cuitDigits = data.cuit.replace(/\D/g, '');
      if (cuitDigits.length !== 11) e.cuit = 'El CUIT debe tener 11 dígitos';
    } else {
      if (!data.name.trim() || data.name.trim().length < 2) e.name = 'Ingresá tu nombre';
      if (!/^\d{7,9}$/.test(data.dni.replace(/\D/g, ''))) e.dni = 'DNI inválido';
    }
    if (!/^\S+@\S+\.\S+$/.test(data.email)) e.email = 'Email inválido';
    if (!/^[\d\s\-+()]{8,}$/.test(data.phone)) e.phone = 'Teléfono inválido';
    setErrors(e);
    // Scroll al primer campo con error para que el usuario lo vea
    if (Object.keys(e).length > 0) {
      const firstKey = Object.keys(e)[0];
      const fieldMap = { name: '#w-name', email: '#w-email', phone: '#w-phone', dni: '#w-dni', razonSocial: '#w-razon', cuit: '#w-cuit' };
      const el = document.querySelector(fieldMap[firstKey]);
      if (el) {
        el.scrollIntoView({ behavior: 'smooth', block: 'center' });
        el.focus();
      }
    }
    return Object.keys(e).length === 0;
  };

  const next = () => {
    if (step === 4) {
      if (!validateData()) return;
      setPaying(true);

      // ── Reserva a futuro: anotar con prioridad (sin pago) ──
      if (data.mode === 'futuro') {
        fetch(`${MC_API}/waitlist`, {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            type: 'futuro', email: data.email?.trim().toLowerCase(), name: data.name?.trim(),
            phone: data.phone?.trim(), m2: data.option?.m2, category: data.category?.label,
            branchId: data.sucursal?.id || 'nordelta', desiredDate: data.startDate, duration: data.duration,
          }),
        }).then(() => { setPaying(false); setStep(5); }).catch(() => { setPaying(false); setStep(5); });
        return;
      }

      // ── Flujo real: crear reserva en Firebase + redirigir a Mercado Pago ──
      crearReserva({
        sucursalId: data.sucursal?.id || 'nordelta',
        category:   data.category?.label || data.category?.key || '',
        m2:         data.option?.m2 || 0,
        monthly:    Math.round(totals.monthly * (1 - (totals.annualPctOff || 0))),
        firstMonth: totals.firstMonth,
        startDate:  data.startDate,
        duration:   data.duration || 1,
        freeTrialMonths: totals.monthlyDiscount > 0 ? 1 : 0,
        addons:     (data.addons || []).map(a => a.key || a),
        promosApplied: promos.map(p => ({ key: p.key, badge: p.badge, name: p.name })),
        // Datos del cliente (para guest checkout sin Firebase Auth)
        name:  data.name?.trim()  || '',
        email: data.email?.trim().toLowerCase() || '',
        phone: data.phone?.trim() || '',
        dni:   data.dni?.replace(/\D/g, '') || '',
        viaPromo: (() => { try { return sessionStorage.getItem('mc.viaPromo') === '1'; } catch { return false; } })(),
      }).then(({ reservationId, initPoint }) => {
        // Guardar reserva pendiente localmente y redirigir a MP
        const u = {
          ...user,
          name:  data.name?.trim()  || user?.name  || '',
          email: data.email?.trim().toLowerCase() || user?.email || '',
          phone: data.phone || user?.phone || '',
          dni:   data.dni   || user?.dni   || '',
          provider: user?.provider || 'email',
        };
        store.setUser(u);
        store.addReservation({
          id: reservationId,
          userEmail: u.email,
          status: 'pending_payment',
          sucursal: data.sucursal,
          category: data.category,
          option: data.option,
          startDate: data.startDate,
          duration: data.duration,
          addons: data.addons,
          monthly: totals.monthlyEff,
          monthlyBase: data.option.monthly,
          firstMonth: totals.firstMonth,
          payment: data.payment,
          promosApplied: promos.map(p => ({ key: p.key, badge: p.badge, name: p.name })),
          createdAt: new Date().toISOString(),
        });
        // Redirigir a la página de pago de Mercado Pago
        window.location.href = initPoint;
      }).catch(err => {
        setPaying(false);
        alert('No se pudo iniciar el pago: ' + (err.message || err));
      });
      return;
    }
    setStep(step + 1);
  };

  const back = () => setStep(Math.max(0, step - 1));

  const totalSteps = 5;
  const progress = step >= 5 ? 100 : Math.round(((step + 1) / totalSteps) * 100);

  return (
    <div className="mc-wiz-back" onClick={step < 5 && !paying ? tryClose : undefined} role="dialog" aria-modal="true" aria-labelledby="wiz-title">
      <div className="mc-wiz" onClick={(e) => e.stopPropagation()}>
        {step < 5 && (
          <>
            <div className="mc-wiz-head">
              <div className="step-info">Paso <b>{step + 1}</b> de <b>{totalSteps}</b> · Reservar online</div>
              <button className="close" onClick={tryClose} aria-label="Cerrar" disabled={paying}>
                <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M6 6l12 12M18 6L6 18" /></svg>
              </button>
            </div>
            <div className="mc-wiz-progress"><div className="bar" style={{ width: `${progress}%` }} /></div>
          </>
        )}

        <div className="mc-wiz-body">
          {step === 0 && (
            <>
              <h2 id="wiz-title">¿En qué sucursal?</h2>
              <p className="lead">Nordelta, GBA Norte. Con más sucursales en camino.</p>

              <div className="mc-wiz-how-access">
                <span className="lbl">Cómo funciona el acceso</span>
                <div className="steps">
                  <div><span className="n">1</span><span>Reservás online y pagás con tarjeta</span></div>
                  <div><span className="n">2</span><span>Subís una <b>selfie</b> desde el portal para registrar tu cara</span></div>
                  <div><span className="n">3</span><span>Mirás la cámara en el ingreso y entrás — sin turno, en el horario del local</span></div>
                  <div><span className="n">4</span><span>Gestionás todo (pagos, accesos, facturas) desde tu cuenta online</span></div>
                </div>
              </div>

              <div className="mc-wiz-options sucursales">
                {SUCURSALES.map((s) => (
                  s.comingSoon
                    ? (
                      <div key={s.id} className="mc-wiz-option disabled">
                        <span className="name">{s.name}</span>
                        <span className="range">{s.hood} · {s.address}</span>
                        <span className="desc">Apertura próximamente</span>
                        <span className="pill-avail coming">Próximamente</span>
                      </div>
                    )
                    : (
                      <button
                        key={s.id}
                        type="button"
                        className={`mc-wiz-option ${data.sucursal.id === s.id ? 'selected' : ''}`}
                        onClick={() => setData({ ...data, sucursal: s })}
                      >
                        <span className="name">{s.name}</span>
                        <span className="range">{s.hood} · {s.address}</span>
                        <span className="desc">{s.hours}</span>
                        <span className="pill-avail alta">Disponible</span>
                      </button>
                    )
                ))}
              </div>
            </>
          )}

          {step === 1 && (
            <>
              <h2 id="wiz-title">¿Qué espacio necesitás?</h2>
              <p className="lead">Elegí la categoría y después el tamaño exacto en m².</p>

              <div className="mc-wiz-cat-tabs">
                {CATEGORIES.map((c) => (
                  <button
                    key={c.key}
                    type="button"
                    className={`mc-wiz-cat-tab ${data.category.key === c.key ? 'selected' : ''}`}
                    onClick={() => setCategory(c)}
                  >
                    <b>{c.label}</b>
                    <span>{c.range}</span>
                  </button>
                ))}
              </div>

              <div className="mc-wiz-cat-detail">
                <div className="mc-wiz-cat-blurb">
                  <p>{data.category.blurb}</p>
                  <div className="fits">{data.category.fits.map((f, j) => <span key={j}>{f}</span>)}</div>
                </div>

                <div className="mc-wiz-cat-opts">
                  <span className="opts-lbl">Elegí los m² exactos</span>
                  <div className="opts-grid">
                    {data.category.options.map((o) => {
                      const stock = availByM2[String(o.m2)] ?? 0;
                      const agotado = stock === 0;
                      return (
                      <button
                        key={o.m2}
                        type="button"
                        disabled={agotado}
                        className={`mc-wiz-opt ${data.option.m2 === o.m2 ? 'selected' : ''}`}
                        onClick={() => !agotado && setOption(o)}
                        style={agotado ? { opacity: 0.45, cursor: 'not-allowed' } : undefined}
                        title={agotado ? 'Sin disponibilidad' : `${stock} disponible(s)`}
                      >
                        <b>{formatM2(o.m2)} m²</b>
                        <span>${o.monthly.toLocaleString('es-AR')} <small>/ mes</small></span>
                        {agotado && <span style={{ display: 'block', fontSize: '0.7em', color: '#b00020', fontWeight: 700, marginTop: 2 }}>Sin stock</span>}
                      </button>
                      );
                    })}
                  </div>
                  <span className="hint">Precios finales con IVA · Sucursal {data.sucursal.name}</span>
                  {data.category.options.some((o) => (availByM2[String(o.m2)] ?? 0) === 0) && (
                    <div style={{ marginTop: 14, padding: 12, background: "rgba(61,48,131,0.06)", borderRadius: 10 }}>
                      {wlSent ? (
                        <span style={{ color: "#2e7d00", fontWeight: 600 }}>Listo! Te avisamos cuando se libere una baulera de esa medida.</span>
                      ) : (
                        <>
                          <span style={{ display: "block", fontSize: "0.85em", marginBottom: 6 }}>Hay medidas sin stock. Dejanos tu email y te avisamos cuando se libere una.</span>
                          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                            <input type="email" value={wlEmail} onChange={(e) => setWlEmail(e.target.value)} placeholder="vos@email.com" style={{ flex: 1, minWidth: 180, padding: "8px 10px", borderRadius: 8, border: "1px solid #ccc" }} />
                            <button type="button" className="mc-btn mc-btn-violet" disabled={!wlEmail} onClick={() => {
                              fetch(`${MC_API}/waitlist`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email: wlEmail, m2: data.option?.m2, category: data.category?.label, branchId: data.sucursal?.id || null }) }).then(() => setWlSent(true)).catch(() => setWlSent(true));
                            }}>Quiero que me avisen</button>
                          </div>
                        </>
                      )}
                    </div>
                  )}
                </div>
              </div>
            </>
          )}

          {step === 2 && (
            <>
              <h2 id="wiz-title">¿Cuándo querés empezar?</h2>
              <p className="lead">Reservás la fecha y el espacio queda apartado a tu nombre.</p>
              <div style={{ display: 'flex', gap: 10, marginBottom: 16 }}>
                {[['ahora', 'Ingreso ahora', 'En los próximos 5 a 10 días'], ['futuro', 'Reservar a futuro', 'Para más adelante, con prioridad']].map(([m, t, sub]) => (
                  <button key={m} type="button" onClick={() => setData((d) => { const nx = { ...d, mode: m }; if (m === 'ahora' && (!d.startDate || d.startDate > maxAhora)) nx.startDate = today; if (m === 'futuro' && d.startDate && d.startDate < minFuturo) nx.startDate = ''; return nx; })}
                    style={{ flex: 1, textAlign: 'left', padding: '12px 14px', borderRadius: 12, cursor: 'pointer',
                      border: (data.mode || 'ahora') === m ? '2px solid #5ECA00' : '1px solid #ddd',
                      background: (data.mode || 'ahora') === m ? '#f3fbe9' : '#fff' }}>
                    <b style={{ display: 'block', fontSize: 14 }}>{t}</b>
                    <span style={{ fontSize: 12, color: '#777' }}>{sub}</span>
                  </button>
                ))}
              </div>
              <div className="mc-wiz-row2">
                <div className="mc-wiz-field">
                  <label htmlFor="startDate">{data.mode === 'futuro' ? '¿Cuándo querés ingresar?' : 'Fecha de inicio'}</label>
                  <input id="startDate" type="date" min={data.mode === 'futuro' ? minFuturo : today} max={data.mode === 'futuro' ? undefined : maxAhora} value={data.startDate} onChange={(e) => setData({ ...data, startDate: e.target.value })} />
                  <span className="hint">{data.mode === 'futuro' ? 'La fecha que tenés pensada.' : 'Mañana o más adelante.'}</span>
                </div>
                <div className="mc-wiz-field">
                  <label htmlFor="duration">Duración estimada</label>
                  <select id="duration" value={data.duration} onChange={(e) => setData({ ...data, duration: parseInt(e.target.value, 10) })}>
                    <option value={1}>1 mes</option>
                    <option value={3}>3 meses</option>
                    <option value={6}>6 meses</option>
                    <option value={12}>1 año (20% off)</option>
                    <option value={24}>2 años o más</option>
                  </select>
                  <span className="hint">Es solo una estimación. Cancelás cuando quieras.</span>
                </div>
              </div>
              {data.mode === 'futuro' && (
                <div className="mc-wiz-promo-card" style={{ background: '#f3f0ff', borderColor: '#d9cffc' }}>
                  <span className="mc-promo-badge violet">Reserva con prioridad</span>
                  <p>No garantiza la disponibilidad: cuando llegue esa fecha, si hay una libre de esa medida, tenés prioridad para que te la asignen. Si querés asegurarla, contratá en los próximos 5–10 días para no perder tu lugar.</p>
                </div>
              )}
              {data.duration >= 12 && (
                <div className="mc-wiz-promo-card">
                  <span className="mc-promo-badge green">20% off anual</span>
                  <p>Al pagar 12 meses por adelantado te ahorrás un 20% sobre la mensualidad.</p>
                </div>
              )}
            </>
          )}

          {step === 3 && (
            <>
              <h2 id="wiz-title">¿Sumás algo más?</h2>
              <p className="lead">Servicios opcionales. Todos los podés agregar más tarde desde el portal.</p>
              {ADDONS.map((a) => {
                const isFree = a.key === 'pickup' && data.option.m2 >= 10 && data.addons.includes('pickup');
                return (
                  <button
                    key={a.key}
                    type="button"
                    className={`mc-wiz-addon ${data.addons.includes(a.key) ? 'selected' : ''}`}
                    onClick={() => toggleAddon(a.key)}
                    aria-pressed={data.addons.includes(a.key)}
                  >
                    <span className="check">
                      {data.addons.includes(a.key) && (
                        <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12l5 5L20 7" /></svg>
                      )}
                    </span>
                    <span className="body">
                      <b>{a.name}</b>
                      <span>{a.desc}</span>
                      {a.key === 'pickup' && data.option.m2 >= 10 && (
                        <span className="mc-promo-badge violet inline">Mudanza gratis +10m²</span>
                      )}
                    </span>
                    <span className="cost">
                      {isFree ? (<><s>${a.cost.toLocaleString('es-AR')}</s> <b>GRATIS</b></>) : `+$${a.cost.toLocaleString('es-AR')}`}
                    </span>
                  </button>
                );
              })}
            </>
          )}

          {step === 4 && (
            <>
              <h2 id="wiz-title">Tus datos y pago</h2>
              <p className="lead">Te creamos la cuenta y te redirigimos al checkout de Mercado Pago.</p>

              <div className="mc-wiz-client-toggle">
                <button
                  type="button"
                  className={`opt ${data.clientType === 'persona' ? 'active' : ''}`}
                  onClick={() => setData({ ...data, clientType: 'persona' })}
                >
                  <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>
                  Persona
                </button>
                <button
                  type="button"
                  className={`opt ${data.clientType === 'empresa' ? 'active' : ''}`}
                  onClick={() => setData({ ...data, clientType: 'empresa' })}
                >
                  <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg>
                  Empresa
                </button>
              </div>

              <div className="mc-wiz-summary">
                <h4>Tu reserva</h4>
                <div className="mc-wiz-endow">
                  <span className="mc-wiz-endow-lbl">
                    {data.clientType === 'empresa' ? 'Reservado a nombre de empresa' : 'Apartado a tu nombre'}
                  </span>
                  <b>{data.category.label} · {formatM2(data.option.m2)} m²</b>
                  <span>en {data.sucursal.name} · {data.sucursal.hood}</span>
                </div>
                <div className="row"><span>Inicio</span><b>{data.startDate || '—'}</b></div>
                <div className="row"><span>Duración estimada</span><b>{totals.monthlyDiscount > 0 ? `${data.duration + 1} meses (${data.duration} + 1° gratis)` : `${data.duration} ${data.duration === 1 ? 'mes' : 'meses'}`}</b></div>

                {totals.annualPctOff > 0 ? (
                  <div className="row">
                    <span>Mensualidad</span>
                    <b><s style={{ color: 'var(--mc-ink-4)', fontWeight: 500 }}>${totals.monthly.toLocaleString('es-AR')}</s> ${Math.round(totals.monthly * (1 - totals.annualPctOff)).toLocaleString('es-AR')}</b>
                  </div>
                ) : (
                  <div className="row"><span>Mensualidad</span><b>${totals.monthly.toLocaleString('es-AR')}</b></div>
                )}

                {data.addons.length > 0 && (
                  <div className="row">
                    <span>Add-ons</span>
                    <b>
                      {totals.pickupDiscount > 0 && totals.pickupCost > 0
                        ? <><s style={{ color: 'var(--mc-ink-4)', fontWeight: 500 }}>+${(totals.pickupCost + totals.addonOneOff).toLocaleString('es-AR')}</s> +${totals.addonOneOff.toLocaleString('es-AR')}</>
                        : `+$${(totals.pickupCost + totals.addonOneOff).toLocaleString('es-AR')}`}
                    </b>
                  </div>
                )}

                {promos.length > 0 && (
                  <div className="mc-wiz-promos-applied">
                    <span className="lbl">Promos aplicadas</span>
                    {promos.map((p) => <span key={p.key} className={`mc-promo-badge ${p.color}`}>{p.badge}</span>)}
                  </div>
                )}

                <div className="total">
                  <span>Primer pago</span>
                  <b>${totals.firstMonth.toLocaleString('es-AR')}</b>
                </div>
                <div className="row hint"><span>IVA incluido</span><span></span></div>
              </div>

              {data.clientType === 'persona' ? (
                <>
                  <div className="mc-wiz-row2">
                    <div className="mc-wiz-field">
                      <label htmlFor="w-name">Nombre completo</label>
                      <input id="w-name" type="text" value={data.name} onChange={(e) => setData({ ...data, name: e.target.value })} placeholder="Julia Martínez" />
                      {errors.name && <span className="err">{errors.name}</span>}
                    </div>
                    <div className="mc-wiz-field">
                      <label htmlFor="w-email">Email</label>
                      <input id="w-email" type="email" value={data.email} onChange={(e) => setData({ ...data, email: e.target.value })} placeholder="vos@email.com" />
                      {errors.email && <span className="err">{errors.email}</span>}
                    </div>
                  </div>
                  <div className="mc-wiz-row2">
                    <div className="mc-wiz-field">
                      <label htmlFor="w-phone">Teléfono</label>
                      <input id="w-phone" type="tel" value={data.phone} onChange={(e) => setData({ ...data, phone: e.target.value })} placeholder="11 5555-5555" />
                      {errors.phone && <span className="err">{errors.phone}</span>}
                    </div>
                    <div className="mc-wiz-field">
                      <label htmlFor="w-dni">DNI</label>
                      <input id="w-dni" type="text" value={data.dni} onChange={(e) => setData({ ...data, dni: e.target.value })} placeholder="32.123.456" />
                      {errors.dni && <span className="err">{errors.dni}</span>}
                    </div>
                  </div>
                </>
              ) : (
                <>
                  <div className="mc-wiz-field">
                    <label htmlFor="w-razon">Razón social</label>
                    <input id="w-razon" type="text" value={data.razonSocial} onChange={(e) => setData({ ...data, razonSocial: e.target.value })} placeholder="Mi Empresa S.A." />
                    {errors.razonSocial && <span className="err">{errors.razonSocial}</span>}
                  </div>
                  <div className="mc-wiz-row2">
                    <div className="mc-wiz-field">
                      <label htmlFor="w-cuit">CUIT</label>
                      <input id="w-cuit" type="text" value={data.cuit} onChange={(e) => setData({ ...data, cuit: e.target.value })} placeholder="30-12345678-9" />
                      {errors.cuit && <span className="err">{errors.cuit}</span>}
                      <span className="hint">11 dígitos sin guiones</span>
                    </div>
                    <div className="mc-wiz-field">
                      <label htmlFor="w-email-emp">Email de contacto</label>
                      <input id="w-email-emp" type="email" value={data.email} onChange={(e) => setData({ ...data, email: e.target.value })} placeholder="admin@miempresa.com" />
                      {errors.email && <span className="err">{errors.email}</span>}
                    </div>
                  </div>
                  <div className="mc-wiz-field">
                    <label htmlFor="w-phone-emp">Teléfono</label>
                    <input id="w-phone-emp" type="tel" value={data.phone} onChange={(e) => setData({ ...data, phone: e.target.value })} placeholder="11 5555-5555" />
                    {errors.phone && <span className="err">{errors.phone}</span>}
                  </div>
                </>
              )}

              <div className="mc-wiz-pay">
                {data.mode === 'futuro' && (
                  <>
                    <button type="button" className="mc-btn mc-btn-violet big" onClick={next} style={{ width: '100%', justifyContent: 'center' }}>
                      <span>Anotarme con prioridad</span><span className="arrow">→</span>
                    </button>
                    <div className="mc-wiz-recurring-note"><span>No se cobra nada ahora. Te avisamos cuando se libere una de {data.option?.m2} m² para tu fecha.</span></div>
                  </>
                )}
                {data.mode !== 'futuro' && (<>
                <span className="lbl">Forma de pago</span>
                {/* Botón real de MP — al hacer click inicia el pago */}
                <button
                  type="button"
                  className="mc-wiz-pay-mp-btn"
                  onClick={next}
                  aria-label="Pagar con Mercado Pago"
                >
                  <div className="mc-wiz-pay-mp-btn__top">
                    <img
                      src="assets/mp-logo.png"
                      alt="Mercado Pago"
                      className="mc-mp-official-logo"
                      height="28"
                    />
                    <span className="featured-tag">Suscripción mensual</span>
                  </div>
                  <div className="mc-wiz-pay-mp-btn__body">
                    <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><rect x="2" y="5" width="20" height="14" rx="2"/><path d="M2 10h20"/></svg>
                    <div>
                      <b>Tarjeta de crédito o débito</b>
                      <p>Cobro automático cada mes. Cancelás cuando quieras.</p>
                    </div>
                  </div>
                  <div className="mc-wiz-pay-mp-btn__cta">
                    Pagar <b>${totals.firstMonth.toLocaleString('es-AR')}</b> ahora →
                  </div>
                </button>
                <div className="mc-wiz-recurring-note">
                  <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <path d="M21 12a9 9 0 11-3-6.7L21 8" />
                    <path d="M21 3v5h-5" />
                  </svg>
                  <span>Próximos cobros: <b>${Math.round(totals.monthly * (1 - totals.annualPctOff)).toLocaleString('es-AR')}/mes</b>. Primer cobro hoy de ${totals.firstMonth.toLocaleString('es-AR')}.</span>
                </div>
                </>)}
              </div>
            </>
          )}

          {step === 5 && (
            <div className="mc-wiz-success">
              <div className="badge" aria-hidden="true">
                <svg viewBox="0 0 24 24" width="32" height="32" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12l5 5L20 7" /></svg>
              </div>
              <h2>{data.mode === 'futuro' ? '¡Quedaste anotado con prioridad!' : '¡Suscripción activa!'}</h2>
              <p>{data.mode === 'futuro'
                ? <>Te anotamos para una de <b>{data.option?.m2} m²</b> a partir del <b>{data.startDate}</b>. Cuando se libere una, te avisamos por orden de prioridad.</>
                : <>Te enviamos a <b>{data.email}</b> la credencial digital, la factura y el resumen.</>}</p>
              <div className="code">{store.getReservations()[0]?.id}</div>

              {data.mode !== 'futuro' && (<>
              <div className="mc-wiz-next-steps">
                <span className="lbl">¿Qué pasa ahora?</span>
                <div className="step"><span className="n">1</span><span>Te llega un email de confirmación con el comprobante de pago.</span></div>
                <div className="step"><span className="n">2</span><span>El día <b>{data.startDate}</b> tu espacio queda activo en <b>{data.sucursal.name}</b>.</span></div>
                <div className="step"><span className="n">3</span><span>Mirás la cámara en la entrada — el sistema te reconoce y abre. Sin turno, sin esperar.</span></div>
                <div className="step"><span className="n">4</span><span>Cada mes Mercado Pago cobra automáticamente. Cancelás desde el portal cuando quieras.</span></div>
              </div>

              <div className="mc-wiz-billing-note">
                <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><rect x="3" y="5" width="18" height="14" rx="2"/><path d="M3 10h18"/></svg>
                <span>Factura emitida por <b>{BILLING_ENTITY.razonSocial}</b> · {BILLING_ENTITY.domicilio}, {BILLING_ENTITY.localidad}, {BILLING_ENTITY.partido}</span>
              </div>

              <div className="mc-wiz-recurring-summary">
                <div><span>Primer cobro · hoy</span><b>${totals.firstMonth.toLocaleString('es-AR')}</b></div>
                <div><span>Próximos cobros · mensual</span><b>${Math.round(totals.monthly * (1 - totals.annualPctOff)).toLocaleString('es-AR')}</b></div>
              </div>
              </>)}
              {data.mode === 'futuro' && (
                <div className="mc-wiz-next-steps">
                  <span className="lbl">¿Qué pasa ahora?</span>
                  <div className="step"><span className="n">1</span><span>Quedás en la lista de prioridad para esa medida y fecha.</span></div>
                  <div className="step"><span className="n">2</span><span>Cuando se libere una, te contactamos por orden de llegada.</span></div>
                  <div className="step"><span className="n">3</span><span>Si la querés asegurar ya, podés contratar una disponible en los próximos días.</span></div>
                </div>
              )}
              <div className="actions">
                <a className="mc-btn mc-btn-violet" href="#/portal"><span>Ir al portal</span><span className="arrow">→</span></a>
                <button className="mc-btn mc-btn-ghost" onClick={onClose}><span>Cerrar</span></button>
              </div>
            </div>
          )}
        </div>

        {paying && (
          <div className="mc-mp-overlay" role="status" aria-live="polite">
            <div className="mc-mp-loader">
              <div className="logo-big"><img src="assets/mp-logo.png" alt="Mercado Pago" height="48" /></div>
              <div className="spinner" aria-hidden="true"></div>
              <p>Conectando con <b>Mercado Pago</b>…</p>
              <p className="sub">No cierres la ventana. Te redirigimos al checkout seguro.</p>
            </div>
          </div>
        )}

        {exitOpen && (
          <ExitIntent
            promo={promosForPlacement('exit-intent')[0]}
            data={data}
            onAccept={onExitAccept}
            onDecline={onExitDecline}
          />
        )}

        {step < 5 && !paying && (
          <div className="mc-wiz-foot">
            {step === 4 && (
              <div className="mc-wiz-trust">
                <span>🔒 Pago seguro</span>
                <span>· Sin tarjeta hasta confirmar</span>
                <span>· Cancelás cuando quieras</span>
              </div>
            )}
            {step > 0 ? (
              <button className="mc-btn mc-btn-ghost" onClick={back}><span>← Atrás</span></button>
            ) : <span />}
            <button className="mc-btn mc-btn-green" onClick={next} style={step === 4 ? {display:'none'} : {}}>
              {step !== 4 && (
                <><span>Continuar</span><span className="arrow">→</span></>
              )}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

/* ════════════════════════════════════════════════════════════════ */
/* Google login                                                       */
/* ════════════════════════════════════════════════════════════════ */
function decodeJWT(token) {
  try {
    const payload = token.split('.')[1];
    const padded = payload + '='.repeat((4 - payload.length % 4) % 4);
    return JSON.parse(atob(padded.replace(/-/g, '+').replace(/_/g, '/')));
  } catch { return null; }
}

function GoogleButton({ onSuccess }) {
  const [loading, setLoading] = useState(false);

  const handleClick = async () => {
    if (!window._fb) return;
    setLoading(true);
    try {
      const result = await window._fb.signInWithGoogle();
      const u = result.user;
      onSuccess({ uid: u.uid, email: u.email, name: u.displayName, picture: u.photoURL, provider: 'google' });
    } catch (e) {
      if (e.code !== 'auth/popup-closed-by-user') console.warn('Google sign-in error:', e);
    } finally {
      setLoading(false);
    }
  };

  return (
    <button type="button" className="mc-google-btn" onClick={handleClick} disabled={loading}>
      {loading
        ? <span style={{ fontSize: 13 }}>Abriendo Google…</span>
        : <>
            <svg viewBox="0 0 48 48" width="18" height="18" aria-hidden="true">
              <path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3c-1.6 4.6-6 8-11.3 8-6.6 0-12-5.4-12-12s5.4-12 12-12c3 0 5.8 1.1 7.9 3l5.7-5.7C34.1 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.3-.4-3.5z" />
              <path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.6 16 19 13 24 13c3 0 5.8 1.1 7.9 3l5.7-5.7C34.1 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z" />
              <path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2c-2 1.5-4.5 2.4-7.2 2.4-5.3 0-9.7-3.4-11.3-8l-6.5 5C9.5 39.6 16.2 44 24 44z" />
              <path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.1-4.1 5.6l6.2 5.2C41 35.5 44 30.2 44 24c0-1.3-.1-2.3-.4-3.5z" />
            </svg>
            <span>Continuar con Google</span>
          </>
      }
    </button>
  );
}

function GoogleDemoPicker({ onPick, onClose }) {
  const [email, setEmail] = useState('');
  const [name, setName] = useState('');
  const submit = (e) => {
    e.preventDefault();
    if (!/^\S+@\S+\.\S+$/.test(email)) return;
    onPick({ email: email.toLowerCase().trim(), name: name.trim() || email.split('@')[0], provider: 'google' });
    onClose();
  };
  return (
    <div className="mc-wiz-back" onClick={onClose}>
      <div className="mc-modal-demo" onClick={(e) => e.stopPropagation()}>
        <div className="head">
          <svg viewBox="0 0 48 48" width="20" height="20"><path fill="#4285F4" d="M43.6 20.5H42V20H24v8h11.3c-1.6 4.6-6 8-11.3 8-6.6 0-12-5.4-12-12s5.4-12 12-12c3 0 5.8 1.1 7.9 3l5.7-5.7C34.1 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.3-.4-3.5z" /></svg>
          <b>Continuar con Google</b>
          <span className="demo-tag">Demo</span>
        </div>
        <p className="sub">Esta es una simulación. En producción usás tu cuenta real de Google.</p>
        <form onSubmit={submit}>
          <div className="mc-wiz-field">
            <label>Nombre</label>
            <input type="text" value={name} onChange={(e) => setName(e.target.value)} placeholder="Augusto Martínez" autoFocus />
          </div>
          <div className="mc-wiz-field">
            <label>Email de Google</label>
            <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="vos@gmail.com" required />
          </div>
          <button type="submit" className="mc-btn mc-btn-violet full">
            <span>Continuar</span>
            <span className="arrow">→</span>
          </button>
        </form>
      </div>
    </div>
  );
}

/* ════════════════════════════════════════════════════════════════ */
/* Portal                                                             */
/* ════════════════════════════════════════════════════════════════ */
function PortalLogin({ onLogin }) {
  const [mode, setMode] = useState('login'); // 'login' | 'activate'
  const [email, setEmail] = useState('');
  const [pass, setPass] = useState('');
  const [err, setErr] = useState('');
  const [info, setInfo] = useState('');
  const [busy, setBusy] = useState(false);

  const handleGoogle = (user) => { store.setUser(user); onLogin && onLogin(user); };

  const doLogin = async (e) => {
    e.preventDefault();
    setErr(''); setInfo('');
    if (!/^\S+@\S+\.\S+$/.test(email)) { setErr('Ingresá un email válido'); return; }
    if (!pass) { setErr('Ingresá tu contraseña'); return; }
    if (!window._fb || !window._fb.signInWithEmail) { setErr('No se pudo iniciar sesión'); return; }
    setBusy(true);
    try {
      const result = await window._fb.signInWithEmail(email.toLowerCase().trim(), pass);
      const u = result.user;
      if (!u.emailVerified) {
        setErr('Tenés que confirmar tu email antes de entrar. Revisá tu casilla o reenviá el mail de activación.');
        if (window._fb.signOut) await window._fb.signOut();
        setBusy(false);
        return;
      }
      const user = { uid: u.uid, email: u.email, name: u.displayName || u.email.split('@')[0], provider: 'email' };
      store.setUser(user);
      onLogin && onLogin(user);
    } catch (ex) {
      const code = (ex && ex.code) || '';
      if (code.indexOf('wrong-password') >= 0 || code.indexOf('invalid-credential') >= 0) setErr('Email o contraseña incorrectos.');
      else if (code.indexOf('user-not-found') >= 0) setErr('No encontramos una cuenta con ese email. Si es tu primera vez, activá tu cuenta.');
      else if (code.indexOf('too-many-requests') >= 0) setErr('Demasiados intentos. Probá más tarde.');
      else setErr('No se pudo iniciar sesión.');
      setBusy(false);
    }
  };

  const doActivate = async (e) => {
    e.preventDefault();
    setErr(''); setInfo('');
    if (!/^\S+@\S+\.\S+$/.test(email)) { setErr('Ingresá un email válido'); return; }
    setBusy(true);
    try {
      await fetch(`${MC_API}/portal/activate`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: email.toLowerCase().trim() }) });
    } catch (e2) { /* respuesta siempre generica */ }
    setInfo('Si tu email está registrado, te enviamos un link para crear tu contraseña y activar tu cuenta. Revisá tu casilla (y el spam).');
    setBusy(false);
  };

  return (
    <div className="mc-login">
      <div className="mc-login-card">
        <span className="mc-eyebrow violet">Portal cliente</span>
        <h2>Entrá a <span className="v">tu cuenta</span>.</h2>
        {mode === 'login' ? (
          <>
            <p>Iniciá sesión con Google, o con tu email y contraseña.</p>
            <GoogleButton onSuccess={handleGoogle} />
            <div className="mc-login-divider"><span>o con tu email</span></div>
            <form onSubmit={doLogin}>
              <div className="mc-wiz-field">
                <label htmlFor="login-email">Email</label>
                <input id="login-email" type="email" value={email} onChange={(e) => { setEmail(e.target.value); setErr(''); }} placeholder="vos@email.com" />
              </div>
              <div className="mc-wiz-field">
                <label htmlFor="login-pass">Contraseña</label>
                <input id="login-pass" type="password" value={pass} onChange={(e) => { setPass(e.target.value); setErr(''); }} placeholder="Tu contraseña" />
              </div>
              {err && <span className="err">{err}</span>}
              {info && <span style={{ color: '#2e7d00', fontSize: 13 }}>{info}</span>}
              <button type="submit" className="mc-btn mc-btn-violet full" disabled={busy}>
                <span>{busy ? 'Entrando…' : 'Ingresar'}</span>
                <span className="arrow">→</span>
              </button>
            </form>
            <button type="button" onClick={() => { setMode('activate'); setErr(''); setInfo(''); }} style={{ background: 'none', border: 'none', color: '#5b21b6', cursor: 'pointer', marginTop: 12, fontSize: 13, textDecoration: 'underline' }}>
              ¿Primera vez o olvidaste tu clave? Activá tu cuenta
            </button>
          </>
        ) : (
          <>
            <p>Te enviamos un link a tu email para <b>crear tu contraseña</b> y activar tu cuenta.</p>
            <form onSubmit={doActivate}>
              <div className="mc-wiz-field">
                <label htmlFor="act-email">Email</label>
                <input id="act-email" type="email" value={email} onChange={(e) => { setEmail(e.target.value); setErr(''); }} placeholder="vos@email.com" />
              </div>
              {err && <span className="err">{err}</span>}
              {info && <span style={{ color: '#2e7d00', fontSize: 13 }}>{info}</span>}
              <button type="submit" className="mc-btn mc-btn-violet full" disabled={busy}>
                <span>{busy ? 'Enviando…' : 'Enviarme el link'}</span>
                <span className="arrow">→</span>
              </button>
            </form>
            <button type="button" onClick={() => { setMode('login'); setErr(''); setInfo(''); }} style={{ background: 'none', border: 'none', color: '#5b21b6', cursor: 'pointer', marginTop: 12, fontSize: 13 }}>
              ← Volver a ingresar
            </button>
          </>
        )}
        <a className="mc-login-back" href="#/">← Volver al inicio</a>
      </div>
    </div>
  );
}

function PortalDashboard({ user, reservations, accountData, accountLoading, onLogout, onReserve }) {
  // Contratos activos — tanto MP (status=active) como manuales (status=CONFIRMED)
  const active = reservations.filter((r) =>
    r.status === 'active' || r.status === 'CONFIRMED' || r.status === 'authorized'
  );
  const totalMonthly = accountData?.totalMonthly ||
    active.reduce((sum, r) => sum + (r.monthly || r.monthlyPrice || 0), 0);
  const sucursalCount = new Set(active.map((r) => r.sucursal?.id || r.branchId || 'nordelta')).size;
  return (
    <>
      <section className="mc-portal-hero">
        <div className="mc-portal-hero-inner">
          <span className="mc-eyebrow on-dark">Portal cliente</span>
          <h1>Hola, <span className="g">{user.name || user.email.split('@')[0]}</span>.</h1>
          <p>Acá vas a ver todas tus reservas, facturas y accesos. Podés tener varios boxes en distintas sucursales gestionados desde la misma cuenta.</p>
        </div>
      </section>
      {accountData && accountData.customer && accountData.customer.manualDebt && (
        <div style={{ maxWidth: 1100, margin: '16px auto 0', padding: '0 20px' }}>
          <div style={{ background: '#fff4e5', border: '1px solid #ffcc80', color: '#8a4b00', borderRadius: 12, padding: '14px 18px', fontWeight: 600 }}>
            Pago pendiente: regulariza tu cuenta para mantener tu acceso{accountData.customer.debtNote ? ' (' + accountData.customer.debtNote + ')' : ''}. Si ya pagaste, escribinos por WhatsApp.
          </div>
        </div>
      )}
      <div className="mc-portal">
        <div className="mc-portal-grid">
          <div className="mc-portal-card">
            <h3>Tus reservas <span className="lbl">{reservations.length} total · {active.length} activas</span></h3>
            {reservations.length === 0 ? (
              <div className="mc-portal-empty">
                <b>Todavía no tenés reservas</b>
                <p>Reservá tu primer espacio en menos de 5 minutos.</p>
                <button className="mc-btn mc-btn-green" onClick={onReserve}>
                  <span>Reservar ahora</span><span className="arrow">→</span>
                </button>
              </div>
            ) : (
              <div className="mc-res-list">
                {reservations.map((r, i) => {
                  const isManual = r.source === 'manual';
                  const isPending = r.status === 'pending_payment' || r.mpSubscriptionStatus === 'pending';
                  const isActive  = r.status === 'active' || r.status === 'CONFIRMED' || r.status === 'authorized';

                  const title = isManual
                    ? `${r.bauleraCodigo || r.storageRoom?.space || 'Baulera'} · ${r.m2}m²`
                    : `${r.category?.label || r.category || 'Pequeño'} · ${r.m2 || ''}m²`;
                  const location = isManual
                    ? `Nordelta · Edificio A · Piso ${r.storageRoom?.floor || '—'}`
                    : `Nordelta · GBA Norte`;
                  const monthly = r.monthly || r.monthlyPrice || 0;
                  const statusKey = isActive ? 'active' : r.status === 'cancelled' ? 'cancelled' : 'pending';
                  const statusLabel = isActive ? 'Activa' : r.status === 'cancelled' ? 'Cancelada' : 'Pago pendiente';
                  const contractNum = r.contractNumber ? `CTO-${r.contractNumber}` : r.id;

                  // Reservas con pago pendiente → botón de completar pago en MP
                  const mpLink = r.mpInitPoint ||
                    (r.mpPreapprovalId ? `https://www.mercadopago.com.ar/subscriptions/checkout?preapproval_id=${r.mpPreapprovalId}` : null);

                  if (isPending && mpLink) {
                    return (
                      <div key={r.id} className="mc-res-card mc-res-card-pending">
                        <span className="num">0{i + 1}</span>
                        <div className="info">
                          <b>{title}</b>
                          <span>{location}</span>
                          <span>{contractNum}</span>
                          <span className="badge pending">Pago pendiente</span>
                        </div>
                        <div className="price">
                          <a href={mpLink} className="mc-btn mc-btn-mp compact" style={{ textDecoration:'none', display:'inline-flex', alignItems:'center', gap:6, padding:'8px 14px', borderRadius:6, background:'#009ee3', color:'white', fontSize:13, fontWeight:700 }}>
                            <svg viewBox="0 0 80 28" width="40" height="14" style={{filter:'brightness(0) invert(1)'}}><circle cx="10" cy="14" r="10" fill="#fff" opacity=".3"/><text x="25" y="19" fontFamily="Arial" fontWeight="800" fontSize="11" fill="#fff">pago</text></svg>
                            Completar pago
                          </a>
                          <small style={{display:'block', marginTop:4, color:'#999'}}>${monthly.toLocaleString('es-AR')}/mes</small>
                        </div>
                      </div>
                    );
                  }

                  return (
                    <a key={r.id} className="mc-res-card" href={`#/portal/r/${r.id}`}>
                      <span className="num">0{i + 1}</span>
                      <div className="info">
                        <b>{title}</b>
                        <span>{location}</span>
                        <span>Inicio: {r.startDate || r.entryDate} · {contractNum}</span>
                        <span className={`badge ${statusKey}`}>{statusLabel}</span>
                      </div>
                      <div className="price">
                        ${monthly.toLocaleString('es-AR')}
                        <small>por mes</small>
                      </div>
                    </a>
                  );
                })}
              </div>
            )}
            <div style={{ marginTop: 18, paddingTop: 18, borderTop: '1px solid var(--mc-line)' }}>
              <button className="mc-btn mc-btn-green" onClick={onReserve}>
                <span>+ Nueva reserva</span><span className="arrow">→</span>
              </button>
            </div>
          </div>
          <div className="mc-portal-card">
            <h3>Resumen <span className="lbl">Tu cuenta</span></h3>
            <div className="mc-portal-stats">
              <div className="stat">
                <span className="lbl">Reservas activas</span>
                <b>{active.length}</b>
                <span className="sub">en {sucursalCount} {sucursalCount === 1 ? 'sucursal' : 'sucursales'}</span>
              </div>
              <div className="stat">
                <span className="lbl">Mensual total</span>
                <b>${totalMonthly.toLocaleString('es-AR')}</b>
                <span className="sub">Suscripción vía Mercado Pago</span>
              </div>
              <div className="stat">
                <span className="lbl">Acceso · {user.provider === 'google' ? 'Google' : 'Email'}</span>
                <b style={{ fontSize: '15px' }}>{user.email}</b>
              </div>
            </div>
            <div style={{ marginTop: 18, display: 'flex', gap: 10, flexWrap: 'wrap' }}>
              <button className="mc-btn mc-btn-ghost" onClick={onLogout}><span>Cerrar sesión</span></button>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}

// PortalEntry: decides what to show based on reservation count (0 / 1 / 2+)
function PortalEntry({ user, reservations, accountData, accountLoading, onLogout, onReserve }) {
  const active = reservations.filter((r) =>
    r.status !== 'cancelled' && r.status !== 'payment_failed'
  );

  // Nombre de bienvenida: prefiere el nombre real del backend
  const displayName = accountData?.customer?.fullName?.split(' ')[0]
    || accountData?.customer?.firstName
    || user.name
    || user.email.split('@')[0];

  // Loading state
  if (accountLoading) {
    return (
      <div className="mc-portal-loading">
        <div className="mc-mp-loader">
          <div className="spinner" aria-hidden="true"></div>
          <p>Cargando tu cuenta…</p>
        </div>
      </div>
    );
  }

  // DASHBOARD VERTICAL (pedido de Lucas 11/07): ya NO se redirige ni hay que entrar a un botón.
  // Todo se ve de entrada, apilado: espacio + estado legible + próximo pago + historial.
  const confirmedActive = active.filter(r =>
    r.status === 'active' || r.status === 'CONFIRMED' || r.status === 'authorized'
  );

  // 0 reservations (activas + pendientes) — empty state
  if (active.length === 0 && reservations.length === 0) {
    return (
      <>
        <section className="mc-portal-hero">
          <div className="mc-portal-hero-inner">
            <span className="mc-eyebrow on-dark">Portal cliente</span>
            <h1>Hola, <span className="g">{user.name || user.email.split('@')[0]}</span>.</h1>
          </div>
        </section>
        <div className="mc-res-selector">
          {accountData && accountData.__error === 'no_auth' ? (
            <div className="mc-portal-block" style={{ textAlign: 'center', padding: '48px 24px' }}>
              <div style={{ fontSize: 40, marginBottom: 12 }}>🔒</div>
              <h3 style={{ fontFamily: 'var(--font-cond)', fontSize: 22, fontWeight: 900, margin: '0 0 8px' }}>
                Tu sesión venció
              </h3>
              <p style={{ fontSize: 14, color: 'var(--mc-ink-2)', marginBottom: 16 }}>
                Cerrá sesión y volvé a entrar para ver tus espacios.
              </p>
              <button className="mc-btn mc-btn-violet" onClick={onLogout}>
                <span>Volver a iniciar sesión</span>
              </button>
            </div>
          ) : accountData && accountData.__error === 'email_not_verified' ? (
            <div className="mc-portal-block" style={{ textAlign: 'center', padding: '48px 24px' }}>
              <div style={{ fontSize: 40, marginBottom: 12 }}>✉️</div>
              <h3 style={{ fontFamily: 'var(--font-cond)', fontSize: 22, fontWeight: 900, margin: '0 0 8px' }}>
                Confirmá tu email para ver tus espacios
              </h3>
              <p style={{ fontSize: 14, color: 'var(--mc-ink-2)', marginBottom: 8 }}>
                Te enviamos un mail a <b>{user.email}</b> para activar tu cuenta y crear tu contraseña.
              </p>
              <p style={{ fontSize: 13, color: 'var(--mc-ink-3)', marginBottom: 0 }}>
                ¿No te llegó? Revisá spam o escribinos y te lo reenviamos.
              </p>
            </div>
          ) : (
          <div className="mc-portal-block" style={{ textAlign: 'center', padding: '48px 24px' }}>
            <div style={{ fontSize: 40, marginBottom: 12 }}>📦</div>
            <h3 style={{ fontFamily: 'var(--font-cond)', fontSize: 22, fontWeight: 900, margin: '0 0 8px' }}>
              Todavía no tenés espacios
            </h3>
            <p style={{ fontSize: 14, color: 'var(--mc-ink-2)', marginBottom: 24 }}>
              Reservá tu primer espacio en menos de 5 minutos.<br />
              Sin depósito · sin permanencia.
            </p>
            <button className="mc-btn mc-btn-green" onClick={onReserve}>
              <span>Reservar ahora</span><span className="arrow">→</span>
            </button>
          </div>
          )}
          <div style={{ marginTop: 16 }}>
            <button className="mc-btn mc-btn-ghost" onClick={onLogout}><span>Cerrar sesión</span></button>
          </div>
        </div>
      </>
    );
  }

  // DASHBOARD VERTICAL — todo de entrada, sin selector ni redirect (pedido de Lucas 11/07):
  // por cada espacio: TU ESPACIO (código + estado legible) → PRÓXIMO PAGO → HISTORIAL DE PAGOS,
  // como bloques separados. Los no activos (pendientes/cancelados) quedan listados abajo.
  const inactivos = reservations.filter((r) => !confirmedActive.some((a) => a.id === r.id));
  return (
    <>
      <section className="mc-portal-hero">
        <div className="mc-portal-hero-inner">
          <span className="mc-eyebrow on-dark">Portal cliente</span>
          <h1>Hola, <span className="g">{user.name || user.email.split('@')[0]}</span>.</h1>
          <p>{confirmedActive.length === 1 ? 'Tu espacio, tus pagos y tu estado — todo acá.' : 'Tus espacios, tus pagos y tu estado — todo acá.'}</p>
        </div>
      </section>
      <div className="mc-res-selector">
        <TourBienvenida onReserve={onReserve} />
        {confirmedActive.map((r) => (
          <div key={r.id} style={{ marginBottom: 36 }}>
            <EspacioResumen reservation={r} />
            <ProximoPago reservation={r} />
            <HistorialPagos reservation={r} />
          </div>
        ))}

        {inactivos.length > 0 && (
          <div style={{ marginTop: 8 }}>
            <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--mc-ink-4)', marginBottom: 10 }}>
              Otras reservas
            </div>
            {inactivos.map((r) => {
              const estado = ESTADO_ES[r.status] || r.status;
              const c = ESTADO_COLOR[estado] || { bg: '#f0f0f0', ink: '#555' };
              return (
                <a key={r.id} className="mc-res-selector-card" href={`#/portal/r/${r.id}`} style={{ marginBottom: 8 }}>
                  <div className="info">
                    <b>{r.bauleraCodigo || r.category?.label || r.category || 'Baulera'}{r.m2 || r.option?.m2 ? ` · ${formatM2(r.m2 || r.option.m2)} m²` : ''}</b>
                    <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10, textTransform: 'uppercase', padding: '2px 8px', borderRadius: 6, background: c.bg, color: c.ink }}>{estado}</span>
                  </div>
                  <span className="arrow">→</span>
                </a>
              );
            })}
          </div>
        )}

        <div style={{ display: 'flex', gap: 12, marginTop: 20, flexWrap: 'wrap' }}>
          <button className="mc-btn mc-btn-ghost" onClick={onReserve}>
            <span>+ Nueva reserva</span>
          </button>
          <button className="mc-btn mc-btn-ghost" onClick={onLogout}><span>Cerrar sesión</span></button>
        </div>
      </div>
    </>
  );
}

// Estado de la reserva en cristiano (nada de "CONFIRMED"/"authorized" crudos en pantalla)
const ESTADO_ES = {
  active: 'Activa', CONFIRMED: 'Activa', authorized: 'Activa',
  pending_payment: 'Pendiente de pago', cancelled: 'Cancelada',
  payment_failed: 'Pago fallido', cancellation_scheduled: 'Cancelación programada',
};
const ESTADO_COLOR = {
  Activa: { bg: '#e7f6e7', ink: '#1a7a1a' },
  'Pendiente de pago': { bg: '#fdf4e3', ink: '#8a5a00' },
  Cancelada: { bg: '#fdecec', ink: '#b42318' },
  'Pago fallido': { bg: '#fdecec', ink: '#b42318' },
  'Cancelación programada': { bg: '#f0f0f0', ink: '#555' },
};

// TUTORIAL de primera vez en el portal: explica cada sección y las acciones típicas.
// Se muestra una sola vez (localStorage mc.portalTourSeen); "Entendido" lo cierra.
function TourBienvenida({ onReserve }) {
  const [visto, setVisto] = useState(() => {
    try { return localStorage.getItem('mc.portalTourSeen') === '1'; } catch (e) { return true; }
  });
  if (visto) return null;
  const cerrar = () => { try { localStorage.setItem('mc.portalTourSeen', '1'); } catch (e) {} setVisto(true); };
  const item = { display: 'flex', gap: 10, alignItems: 'flex-start', fontSize: 14, color: 'var(--mc-ink-2)', marginBottom: 10 };
  return (
    <div className="mc-portal-block" style={{ border: '1.5px solid color-mix(in oklab, var(--mc-violet) 35%, transparent)', marginBottom: 24 }}>
      <span className="mc-portal-block-title">👋 Bienvenido a tu portal — cómo se usa</span>
      <div style={{ marginTop: 10 }}>
        <div style={item}><span>📦</span><span><b>Tu espacio</b> — tu baulera, su estado ("Activa" = todo en orden) y tus datos del contrato.</span></div>
        <div style={item}><span>💳</span><span><b>Próximo pago</b> — cuánto y cuándo se te cobra (o hasta cuándo está pago si abonaste de una).</span></div>
        <div style={item}><span>🧾</span><span><b>Historial de pagos</b> — cada mes con su estado: <b style={{ color: '#1a7a1a' }}>Pagado</b> o <b style={{ color: '#b42318' }}>Rechazado</b>.</span></div>
        <div style={item}><span>⚙️</span><span><b>Gestionar este espacio</b> — desde ahí podés <b>cambiar de tamaño</b> tu baulera o cancelar.</span></div>
        <div style={item}><span>➕</span><span><b>¿Necesitás más lugar?</b> Botón <b>"+ Nueva reserva"</b> (abajo) y sumás otra baulera.</span></div>
        <div style={item}><span>💬</span><span><b>¿Dudas o ayuda?</b> Escribinos por <a href={WHATSAPP} target="_blank" rel="noreferrer" style={{ color: 'var(--mc-violet)', fontWeight: 700 }}>WhatsApp</a> — respondemos rápido.</span></div>
      </div>
      <div style={{ marginTop: 6 }}>
        <button className="mc-btn mc-btn-violet" onClick={cerrar} style={{ fontSize: 13 }}>
          <span>Entendido, ¡gracias!</span>
        </button>
      </div>
    </div>
  );
}

// Resumen del espacio (dashboard vertical): código de baulera + estado legible + datos clave.
function EspacioResumen({ reservation }) {
  const r = reservation;
  const estado = ESTADO_ES[r.status] || r.status;
  const c = ESTADO_COLOR[estado] || { bg: '#f0f0f0', ink: '#555' };
  const m2 = r.m2 || r.option?.m2;
  const codigo = r.bauleraCodigo || (r.storageRoom && r.storageRoom.space) || null;
  return (
    <div className="mc-portal-block mc-espacio">
      <span className="mc-portal-block-title">Tu espacio</span>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', marginBottom: 12 }}>
        <div style={{ fontFamily: 'var(--font-cond)', fontSize: 30, fontWeight: 900 }}>
          {codigo || 'Baulera'}{m2 ? <span style={{ fontSize: 16, fontWeight: 700, color: 'var(--mc-ink-3)', marginLeft: 10 }}>{formatM2 ? formatM2(m2) : m2} m²</span> : null}
        </div>
        <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.06em', padding: '4px 12px', borderRadius: 999, background: c.bg, color: c.ink, fontWeight: 600 }}>{estado}</span>
      </div>
      <div className="mc-espacio-grid">
        <div className="mc-espacio-item">
          <span className="lbl">Sucursal</span>
          <b>{r.sucursal?.name || 'Nordelta'}</b>
        </div>
        <div className="mc-espacio-item">
          <span className="lbl">Inicio</span>
          <span>{r.startDate || '—'}</span>
        </div>
        <div className="mc-espacio-item">
          <span className="lbl">{r.paymentMode === 'onetime' ? 'Abonado' : 'Mensual'}</span>
          <b>${Number(r.monthly || r.monthlyPrice || 0).toLocaleString('es-AR')}{r.paymentMode === 'onetime' ? '' : '/mes'}</b>
        </div>
      </div>
      <div style={{ marginTop: 14 }}>
        <a className="mc-btn mc-btn-ghost-violet" href={`#/portal/r/${r.id}`} style={{ fontSize: 13 }}>
          <span>Gestionar este espacio</span><span className="arrow">→</span>
        </a>
      </div>
    </div>
  );
}

function ProximoPago({ reservation }) {
  const calcNextPayment = () => {
    try {
      const start = new Date(reservation.startDate);
      const today = new Date();
      const next = new Date(start);
      while (next <= today) next.setMonth(next.getMonth() + 1);
      return next.toLocaleDateString('es-AR', { day: 'numeric', month: 'long', year: 'numeric' });
    } catch { return '—'; }
  };

  const monthly = reservation.monthly || reservation.monthlyPrice || 0;
  const isFailed = reservation.status === 'payment_failed';
  const esUnico = reservation.paymentMode === 'onetime';

  return (
    <div className="mc-portal-block mc-pago">
      <span className="mc-portal-block-title">Próximo pago</span>
      {isFailed && (
        <div className="mc-pago-alert">
          <b>Problema con tu pago</b>
          <p>No pudimos cobrar el monto mensual. Tu acceso se suspende en 7 días si no se actualiza la tarjeta.</p>
          <a className="mc-btn mc-btn-ghost" href="https://www.mercadopago.com.ar/subscriptions" target="_blank" rel="noreferrer" style={{ fontSize: 13 }}>
            <span>Actualizar tarjeta en Mercado Pago →</span>
          </a>
        </div>
      )}
      {!isFailed && esUnico && (() => {
        const fecha = reservation.endDate ? String(reservation.endDate).split('-').reverse().join('/') : null;
        const vencido = reservation.endDate ? (new Date(`${reservation.endDate}T23:59:59`) < new Date()) : false;
        const cod = reservation.bauleraCodigo || 'mi baulera';
        const waRenovar = `${WHATSAPP}?text=${encodeURIComponent(`Hola! Mi pago de la baulera ${cod} vence el ${fecha || ''}. Quiero un nuevo link de pago para renovar.`)}`;
        const waSuscribir = `${WHATSAPP}?text=${encodeURIComponent(`Hola! Tengo la baulera ${cod} con pago único y quiero pasarme a suscripción con débito automático.`)}`;
        return (
          <>
            <div className="mc-pago-amount">${monthly.toLocaleString('es-AR')}<small> abonado{reservation.paidMonths ? ` · ${reservation.paidMonths} mes${reservation.paidMonths > 1 ? 'es' : ''}` : ''}</small></div>
            <div className="mc-pago-alert" style={vencido ? {} : { background: '#fdf4e3', borderColor: '#e8c77a' }}>
              <b style={vencido ? {} : { color: '#8a5a00' }}>{vencido ? `Tu permanencia venció el ${fecha}` : `Tu permanencia vence el ${fecha}`}</b>
              <p style={vencido ? {} : { color: '#8a5a00' }}>
                {vencido
                  ? 'Renovala para conservar tu baulera:'
                  : 'Para seguir después de esa fecha, pedí un nuevo link de pago — o pasate al débito automático y olvidate:'}
              </p>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                <a className="mc-btn mc-btn-green" href={waRenovar} target="_blank" rel="noreferrer" style={{ fontSize: 13 }}>
                  <span>Pedir nuevo link de pago</span>
                </a>
                <a className="mc-btn mc-btn-ghost-violet" href={waSuscribir} target="_blank" rel="noreferrer" style={{ fontSize: 13 }}>
                  <span>Suscribirme al débito automático</span>
                </a>
              </div>
            </div>
          </>
        );
      })()}
      {!isFailed && !esUnico && (
        <>
          <div className="mc-pago-amount">${monthly.toLocaleString('es-AR')}<small>/ mes</small></div>
          <div className="mc-pago-next">Próximo cobro: {calcNextPayment()}</div>
        </>
      )}
    </div>
  );
}

// HISTORIAL DE PAGOS — bloque propio, separado de "Próximo pago" (pedido de Lucas 11/07:
// las secciones se veían "muy uno solo"). Trae los cobros REALES de MP; para pago único
// muestra el pago real hecho; si no hay datos reales, cae al calculado.
function HistorialPagos({ reservation }) {
  const [realHist, setRealHist] = useState(null);
  useEffect(() => {
    let alive = true;
    const pid = reservation.mpPreapprovalId;
    if (!pid) return;
    (async () => {
      try {
        const token = await _tryGetFirebaseToken();
        if (!token) return;
        const res = await fetch(`${MC_API}/my-account/payments`, { headers: { Authorization: `Bearer ${token}` } });
        if (!res.ok) return;
        const data = await res.json();
        const sub = (data.subs || []).find((s) => s.mpPreapprovalId === pid);
        if (alive && sub && sub.history && sub.history.length) setRealHist(sub.history);
      } catch (e) { /* si falla, queda el calculado */ }
    })();
    return () => { alive = false; };
  }, [reservation.mpPreapprovalId]);

  const monthly = reservation.monthly || reservation.monthlyPrice || 0;
  const MESES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];

  // Pago único ACTIVO = ese pago ya se hizo (la activación solo ocurre cuando MP confirma el cobro)
  const esUnicoPagado = reservation.paymentMode === 'onetime' &&
    (reservation.status === 'active' || reservation.status === 'CONFIRMED');
  const unicoRow = esUnicoPagado ? [{
    label: (() => { try { const d = new Date(`${reservation.startDate}T12:00:00`); return `${MESES[d.getMonth()]} ${d.getFullYear()}`; } catch { return reservation.startDate; } })(),
    amount: reservation.firstMonth || monthly,
    status: 'approved',
  }] : null;

  const mockHistory = (() => {
    if (!reservation.startDate) return [];
    const rows = [];
    try {
      const start = new Date(reservation.startDate);
      const today = new Date();
      const d = new Date(start);
      let isFirst = true;
      while (d < today) {
        const label = d.toLocaleDateString('es-AR', { month: 'short', year: 'numeric' });
        const amount = isFirst ? (reservation.firstMonth || monthly) : monthly;
        const promoLabel = isFirst && reservation.promosApplied?.some((p) => p.key === 'first-month-free')
          ? '1° mes gratis' : null;
        rows.push({ label, amount, promoLabel });
        d.setMonth(d.getMonth() + 1);
        isFirst = false;
      }
    } catch { return []; }
    return rows.reverse().slice(0, 4);
  })();

  const realRows = realHist ? realHist.map((h) => {
    const p = String(h.period).split('-');
    return { label: `${MESES[Number(p[1]) - 1] || p[1]} ${p[0]}`, amount: h.amount, status: h.status };
  }).slice(0, 6) : null;

  const rows = realRows || unicoRow || mockHistory;
  if (!rows.length) return null;

  return (
    <div className="mc-portal-block mc-pago">
      <span className="mc-portal-block-title">Historial de pagos</span>
      <div className="mc-pago-history" style={{ marginTop: 4 }}>
        {rows.map((row, i) => (
          <div key={i} className="mc-pago-row">
            <span>
              {row.label}
              {row.promoLabel && <span style={{ marginLeft: 6, color: 'var(--mc-green-ink)', fontFamily: 'var(--font-mono)', fontSize: 10 }}>{row.promoLabel}</span>}
            </span>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <b>${row.amount.toLocaleString('es-AR')}</b>
              {row.status
                ? <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.05em', padding: '2px 8px', borderRadius: 6, background: row.status === 'approved' ? '#e7f6e7' : row.status === 'rejected' ? '#fdecec' : '#fdf4e3', color: row.status === 'approved' ? '#1a7a1a' : row.status === 'rejected' ? '#b42318' : '#8a5a00' }}>
                    {row.status === 'approved' ? 'Pagado' : row.status === 'rejected' ? 'Rechazado' : 'Pendiente'}
                  </span>
                : <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--mc-ink-4)' }}>estimado</span>}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function TuEspacio({ reservation, m2Label, catLabel }) {
  const addonNames = (reservation.addons || [])
    .map((k) => ADDONS.find((a) => a.key === k)?.name)
    .filter(Boolean);

  // Para contratos manuales: mostrar baulera real
  const espacioLabel = reservation.bauleraCodigo
    ? `${reservation.bauleraCodigo} · ${m2Label}`
    : `${catLabel} · ${m2Label}`;
  const edificioLabel = reservation.edificio || null;

  return (
    <div className="mc-portal-block mc-espacio">
      <span className="mc-portal-block-title">Tu espacio</span>
      <div className="mc-espacio-grid">
        <div className="mc-espacio-item">
          <span className="lbl">Espacio</span>
          <b>{espacioLabel}</b>
          {edificioLabel && <span>{edificioLabel}</span>}
        </div>
        <div className="mc-espacio-item">
          <span className="lbl">Sucursal</span>
          <b>{reservation.sucursal?.name || 'Nordelta'}</b>
          <span>{reservation.sucursal?.address || 'Av. de los Lagos 7250, Tigre'}</span>
        </div>
        <div className="mc-espacio-item">
          <span className="lbl">Horarios de atención</span>
          <span>{reservation.sucursal?.hours || 'Consultar'}</span>
        </div>
        <div className="mc-espacio-item">
          <span className="lbl">Inicio</span>
          <span>{reservation.startDate}</span>
        </div>
        {addonNames.length > 0 && (
          <div className="mc-espacio-item" style={{ gridColumn: '1 / -1' }}>
            <span className="lbl">Add-ons</span>
            <span>{addonNames.join(' · ')}</span>
          </div>
        )}
      </div>
    </div>
  );
}

function Gestionar({ reservation, onUpdate, onOpenResize, cancelStep, setCancelStep, onReserve }) {
  const cancelDate = addDays(7);
  const isActive = reservation.status === 'active';
  const isCancelScheduled = reservation.status === 'cancellation_scheduled';

  const handleConfirmCancel = () => {
    onUpdate(reservation.id, {
      status: 'cancellation_scheduled',
      cancelEffectiveDate: cancelDate,
      cancelledAt: new Date().toISOString(),
    });
    setCancelStep(2);
  };

  return (
    <div className="mc-portal-block mc-gestionar">
      <span className="mc-portal-block-title">Gestionar</span>
      <div className="mc-gestionar-actions">
        <button className="mc-btn mc-btn-green" onClick={onReserve}>
          <span>+ Agregar otra baulera</span>
        </button>
        {isActive && (
          <button className="mc-btn mc-btn-ghost-violet" onClick={onOpenResize}>
            <span>Cambiar de tamaño</span>
          </button>
        )}
        <hr className="mc-gestionar-divider" />
        {isActive && cancelStep === 0 && (
          <button className="mc-btn mc-btn-ghost" style={{ color: 'var(--mc-ink-3)', fontSize: 14 }} onClick={() => setCancelStep(1)}>
            <span>Cancelar reserva</span>
          </button>
        )}
        {cancelStep === 1 && (
          <div className="mc-cancel-confirm">
            <p><strong>¿Cancelar esta reserva?</strong></p>
            <div className="date">Fecha efectiva: {cancelDate}</div>
            <p style={{ marginBottom: 14, color: 'var(--mc-ink-2)' }}>
              Tu acceso se desactiva en esa fecha. No se cobra más a partir del próximo ciclo.
            </p>
            <div className="mc-cancel-confirm-actions">
              <button className="mc-btn mc-btn-ghost" style={{ background: '#fee2e2', borderColor: '#fca5a5', color: '#991b1b' }} onClick={handleConfirmCancel}>
                <span>Cancelar definitivamente</span>
              </button>
              <button className="mc-btn mc-btn-ghost" onClick={() => setCancelStep(0)}>
                <span>Volver</span>
              </button>
            </div>
          </div>
        )}
        {cancelStep === 2 && (
          <div style={{ padding: '12px 0', textAlign: 'center' }}>
            <p style={{ fontSize: 14, color: 'var(--mc-ink-2)' }}>
              Cancelación programada para el <strong>{cancelDate}</strong>.<br />
              Recibís un email de confirmación.
            </p>
          </div>
        )}
        {isCancelScheduled && cancelStep === 0 && (
          <p style={{ fontSize: 14, color: 'var(--mc-ink-3)' }}>
            Tu reserva se cancela el <strong>{reservation.cancelEffectiveDate}</strong>.
          </p>
        )}
      </div>
    </div>
  );
}

function ResizeModal({ reservation, allCategories, onClose, onUpdate }) {
  const [selected, setSelected] = useState(null);
  const [sent, setSent] = useState(false);

  const currentM2 = reservation.option?.m2;

  const allOpts = allCategories.flatMap((cat) =>
    cat.options.map((opt) => ({ ...opt, catKey: cat.key, catLabel: cat.label }))
  ).filter((opt) => opt.m2 !== currentM2);

  const handleSend = () => {
    const request = {
      id: `RES-${Date.now()}`,
      reservationId: reservation.id,
      currentM2,
      requestedM2: selected.m2,
      requestedMonthly: selected.monthly,
      requestedCat: selected.catLabel,
      status: 'pending',
      createdAt: new Date().toISOString(),
    };
    try {
      const existing = JSON.parse(localStorage.getItem('mc.resize_requests') || '[]');
      existing.unshift(request);
      localStorage.setItem('mc.resize_requests', JSON.stringify(existing));
    } catch { /* silent */ }
    setSent(true);
  };

  return (
    <div className="mc-resize-overlay" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="mc-resize-modal">
        {!sent ? (
          <>
            <h3>Cambiar de tamaño</h3>
            <div className="sub">
              Seleccioná el nuevo tamaño. El cambio se aplica en el próximo ciclo de facturación una vez confirmado.
            </div>
            <div className="mc-resize-current">
              Tamaño actual: {reservation.category?.label} · {currentM2 ? `${formatM2(currentM2)} m²` : '—'} — ${(reservation.monthly || 0).toLocaleString('es-AR')}/mes
            </div>
            <div className="mc-resize-opts">
              {allOpts.map((opt, i) => (
                <button key={i} className={`mc-resize-opt ${selected?.m2 === opt.m2 ? 'selected' : ''}`} onClick={() => setSelected(opt)}>
                  <div>
                    <b>{opt.catLabel} · {formatM2(opt.m2)} m²</b>
                    <span style={{ display: 'block', fontSize: 12, marginTop: 2 }}>
                      {opt.m2 > (currentM2 || 0) ? '↑ Más espacio' : '↓ Menos espacio'}
                    </span>
                  </div>
                  <span className="price">${opt.monthly.toLocaleString('es-AR')}/mes</span>
                </button>
              ))}
            </div>
            <div className="mc-resize-actions">
              <button className="mc-btn mc-btn-violet" disabled={!selected} onClick={handleSend}>
                <span>Solicitar cambio →</span>
              </button>
              <button className="mc-btn mc-btn-ghost" onClick={onClose}>
                <span>Cancelar</span>
              </button>
            </div>
          </>
        ) : (
          <div className="mc-resize-success">
            <div className="icon">📬</div>
            <h4>Solicitud enviada</h4>
            <p>
              Te avisamos por email en 24 hs hábiles cuando el cambio esté confirmado.<br />
              Nuevo tamaño solicitado: <strong>{selected?.catLabel} · {formatM2(selected?.m2)} m²</strong>
            </p>
            <button className="mc-btn mc-btn-ghost" onClick={onClose} style={{ marginTop: 20 }}>
              <span>Cerrar</span>
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

function FaceEnrollFlow({ reservation, onUpdate, onDone }) {
  const [step, setStep] = useState(1); // 1=consent, 2=photo, 3=sent
  const [consented, setConsented] = useState(false);
  const [photoPreview, setPhotoPreview] = useState(null);
  const [sending, setSending] = useState(false);
  const [sendErr, setSendErr] = useState('');
  const fileRef = useRef(null);

  const handleFile = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => setPhotoPreview(ev.target.result);
    reader.readAsDataURL(file);
  };

  // Achica la foto (máx 1024px, JPEG) para que viaje liviana sin perder calidad de registro.
  const comprimir = (dataUrl) => new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      try {
        const max = 1024;
        let w = img.width, h = img.height;
        if (w >= h && w > max) { h = Math.round(h * max / w); w = max; }
        else if (h > w && h > max) { w = Math.round(w * max / h); h = max; }
        const cv = document.createElement('canvas');
        cv.width = w; cv.height = h;
        cv.getContext('2d').drawImage(img, 0, 0, w, h);
        resolve(cv.toDataURL('image/jpeg', 0.85));
      } catch (e) { resolve(dataUrl); }
    };
    img.onerror = () => resolve(dataUrl);
    img.src = dataUrl;
  });

  // SUBIDA REAL: la foto va a Firebase Storage anexada a la reserva/baulera
  // (POST /my-account/face-enroll). Antes esto era solo visual y la foto no iba a ningún lado.
  const handleSend = async () => {
    if (!photoPreview || sending) return;
    setSending(true); setSendErr('');
    try {
      const token = await _tryGetFirebaseToken();
      if (!token) { setSendErr('Tu sesión venció. Cerrá sesión y volvé a entrar.'); setSending(false); return; }
      const image = await comprimir(photoPreview);
      const res = await fetch(`${MC_API}/my-account/face-enroll`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ reservationId: reservation.id, image }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) { setSendErr(data.error || 'No se pudo subir la foto. Probá de nuevo.'); setSending(false); return; }
      onUpdate(reservation.id, { faceEnrollStatus: 'queued' });
      setStep(3);
    } catch (e) {
      setSendErr('No se pudo subir la foto. Revisá tu conexión y probá de nuevo.');
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="mc-enroll">
      {step === 1 && (
        <div className="mc-enroll-step">
          <div className="mc-enroll-step-num">1</div>
          <p style={{ fontSize: 14, color: 'var(--mc-ink-1)', fontWeight: 600, marginBottom: 12 }}>
            Consentimiento biométrico (Ley 25.326)
          </p>
          <button
            className={`mc-enroll-consent ${consented ? 'checked' : ''}`}
            onClick={() => setConsented(!consented)}
            type="button"
          >
            <span className="checkbox">
              {consented && (
                <svg width="12" height="9" viewBox="0 0 12 9" fill="none">
                  <path d="M1 4L4.5 7.5L11 1" stroke="white" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
              )}
            </span>
            <span className="legal">
              <b>Acepto el uso de mis datos biométricos</b> exclusivamente para el control de acceso al local de Mi Container (CORDIS MS SA). Mi foto se guarda en forma segura y privada solo para registrar mi cara en el sistema de acceso del local, y se elimina de los servidores una vez completada el alta en el dispositivo.
            </span>
          </button>
          <button
            className="mc-btn mc-btn-violet"
            style={{ marginTop: 14 }}
            disabled={!consented}
            onClick={() => setStep(2)}
          >
            <span>Continuar →</span>
          </button>
          <button className="mc-btn mc-btn-ghost" style={{ marginTop: 8 }} onClick={onDone}>
            <span>Cancelar</span>
          </button>
        </div>
      )}

      {step === 2 && (
        <div className="mc-enroll-step">
          <div className="mc-enroll-step-num">2</div>
          <p style={{ fontSize: 14, color: 'var(--mc-ink-1)', fontWeight: 600, marginBottom: 8 }}>
            Sacate una foto o subí una imagen
          </p>
          <div style={{ background: '#f5f3ff', border: '1px solid #ddd6fe', borderRadius: 10, padding: '10px 14px', marginBottom: 12, fontSize: 13, color: 'var(--mc-ink-2)' }}>
            <b style={{ color: 'var(--mc-violet)' }}>Cómo tiene que ser la foto (tipo carnet):</b>
            <div style={{ marginTop: 6, display: 'grid', gap: 3 }}>
              <span>✔️ De frente, mirando a la cámara, solo tu cara</span>
              <span>✔️ Con buena luz y fondo claro, foto nítida</span>
              <span>✖️ Sin lentes oscuros, gorra ni barbijo</span>
            </div>
          </div>
          <div className="mc-enroll-photo" onClick={() => fileRef.current?.click()} style={{ cursor: 'pointer' }}>
            {photoPreview
              ? <img src={photoPreview} alt="Vista previa" className="mc-enroll-preview" />
              : <span style={{ fontSize: 28 }}>📷</span>
            }
            <p>{photoPreview ? 'Tocá para cambiar' : 'Tocá para elegir foto'}</p>
          </div>
          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            capture="user"
            onChange={handleFile}
            style={{ display: 'none' }}
          />
          {sendErr && <span className="err" style={{ display: 'block', marginTop: 10 }}>{sendErr}</span>}
          <div style={{ display: 'flex', gap: 10, marginTop: 14 }}>
            <button
              className="mc-btn mc-btn-violet"
              disabled={!photoPreview || sending}
              onClick={handleSend}
            >
              <span>{sending ? 'Subiendo foto…' : 'Enviar foto →'}</span>
            </button>
            <button className="mc-btn mc-btn-ghost" onClick={() => setStep(1)}>
              <span>← Atrás</span>
            </button>
          </div>
        </div>
      )}

      {step === 3 && (
        <div className="mc-enroll-step" style={{ textAlign: 'center', paddingTop: 8 }}>
          <div style={{ fontSize: 36, marginBottom: 12 }}>⏳</div>
          <p style={{ fontSize: 15, fontWeight: 600, color: 'var(--mc-ink-1)', marginBottom: 6 }}>
            Activando tu acceso...
          </p>
          <p style={{ fontSize: 14, color: 'var(--mc-ink-2)', marginBottom: 20 }}>
            Estamos registrando tu cara en {reservation.sucursal?.name}.<br />
            Te avisamos por email cuando tu acceso esté listo.
          </p>
          <button className="mc-btn mc-btn-ghost" onClick={onDone}>
            <span>Entendido</span>
          </button>
        </div>
      )}
    </div>
  );
}

function AccesoFacial({ reservation, onUpdate }) {
  const [enrolling, setEnrolling] = useState(false);
  const status = reservation.faceEnrollStatus || 'not_started';

  // Estado C — activo
  if (status === 'enrolled') {
    return (
      <div className="mc-portal-block mc-acceso state-active">
        <span className="mc-portal-block-title">Acceso facial</span>
        <div className="mc-acceso-icon check">✅</div>
        <h3>Acceso activo — {reservation.sucursal?.name}</h3>
        <p>Podés entrar en el horario del local. Tu cara es tu credencial.</p>
        <div className="sub">{reservation.sucursal?.hours || 'Horarios de atención según sucursal'}</div>
      </div>
    );
  }

  // Estado B — procesando
  if (status === 'queued') {
    return (
      <div className="mc-portal-block mc-acceso state-processing">
        <span className="mc-portal-block-title">Acceso facial</span>
        <div className="mc-acceso-icon spin">⚙️</div>
        <h3>Activando tu acceso...</h3>
        <p>Estamos registrando tu cara en {reservation.sucursal?.name}. En minutos recibís un email.</p>
      </div>
    );
  }

  // Estado D — error
  if (status === 'failed') {
    return (
      <div className="mc-portal-block mc-acceso state-failed">
        <span className="mc-portal-block-title">Acceso facial</span>
        <div className="mc-acceso-icon warning">⚠️</div>
        <h3>Error al activar el acceso</h3>
        <p>La foto no cumplió los requisitos mínimos.</p>
        <div className="mc-acceso-actions">
          <button className="mc-btn mc-btn-violet" onClick={() => setEnrolling(true)}>
            <span>Intentar de nuevo</span>
          </button>
          <a className="mc-btn mc-btn-ghost" href={`https://wa.me/5491136207989?text=Hola,%20necesito%20ayuda%20con%20el%20acceso%20facial%20de%20mi%20reserva%20${reservation.id}`} target="_blank" rel="noreferrer">
            <span>Contactar por WhatsApp</span>
          </a>
        </div>
        {enrolling && <FaceEnrollFlow reservation={reservation} onUpdate={onUpdate} onDone={() => setEnrolling(false)} />}
      </div>
    );
  }

  // Estado A — not_started (default)
  return (
    <div className="mc-portal-block mc-acceso">
      <span className="mc-portal-block-title">Acceso facial</span>
      {!enrolling ? (
        <>
          <div className="mc-acceso-icon lock">🔒</div>
          <h3>Activá tu acceso al local</h3>
          <p>
            Tu espacio está listo. Solo falta registrar tu cara para poder entrar.
            {reservation.status === 'pending_payment' && ' (Disponible una vez confirmado el pago.)'}
          </p>
          {reservation.status === 'active' && (
            <button className="mc-btn mc-btn-violet" onClick={() => setEnrolling(true)}>
              <span>Activar acceso →</span>
            </button>
          )}
          <div className="sub">Solo necesitás una foto · tarda 2 minutos</div>
        </>
      ) : (
        <FaceEnrollFlow reservation={reservation} onUpdate={onUpdate} onDone={() => setEnrolling(false)} />
      )}
    </div>
  );
}

// Normaliza contratos del backend (manual/MP) al formato que usa ReservationPortal
function normalizeReservation(r) {
  if (!r) return r;
  // Si ya tiene el formato completo del wizard (tiene category.label y option.m2), dejarlo
  if (r.category?.label && r.option?.m2) return r;

  const isManual = r.source === 'manual';
  const catLabel = r.category?.label || r.category || 'Baulera';
  const m2 = parseFloat(r.m2) || 0;
  const monthly = r.monthly || r.monthlyPrice || 0;
  const firstMonth = r.firstMonth || monthly;
  const bauleraNombre = r.bauleraCodigo || r.storageRoom?.space || '—';
  const piso = r.storageRoom?.floor || '';

  return {
    ...r,
    // Campos normalizados para los componentes internos
    category: { label: catLabel, key: r.category || 'pequeno' },
    option:   { m2, monthly, label: `${m2}m²` },
    monthly,
    firstMonth,
    sucursal: r.sucursal || {
      id:   r.branchId || 'nordelta',
      name: 'Nordelta',
      hood: 'GBA Norte',
      address: 'Av. de los Lagos 7250',
    },
    // Datos extra para mostrar en TuEspacio
    bauleraCodigo: bauleraNombre,
    edificio: isManual ? `Edificio A · Piso ${piso}` : null,
    startDate: r.startDate || r.entryDate,
    // Normalizar status para los statusConfig
    status: (() => {
      if (r.status === 'CONFIRMED' || r.status === 'authorized') return 'active';
      return r.status || 'pending_payment';
    })(),
  };
}

function ReservationPortal({ reservation: rawReservation, user, initialView, onUpdate, allCategories, onReserve }) {
  const reservation = normalizeReservation(rawReservation);
  const [resizeOpen, setResizeOpen] = useState(initialView === 'cambiar');
  const [cancelStep, setCancelStep] = useState(0); // 0=hidden, 1=confirm, 2=done

  if (!reservation) {
    return (
      <div className="mc-res-portal">
        <div className="mc-portal-block" style={{ textAlign: 'center', padding: 56 }}>
          <h3>Reserva no encontrada</h3>
          <p style={{ fontSize: 14, color: 'var(--mc-ink-2)', marginTop: 8 }}>
            El código no coincide con ninguna reserva tuya.
          </p>
          <a className="mc-btn mc-btn-violet" href="#/portal" style={{ marginTop: 18, display: 'inline-flex' }}>
            <span>← Volver</span>
          </a>
        </div>
      </div>
    );
  }

  const catLabel = reservation.category?.label || reservation.size?.label || '—';
  const m2Label = reservation.option
    ? `${formatM2(reservation.option.m2)} m²`
    : reservation.size?.range || (reservation.m2 ? `${reservation.m2} m²` : '—');
  const headerTitle = reservation.bauleraCodigo
    ? `${reservation.bauleraCodigo} · ${reservation.edificio || reservation.sucursal?.name || 'Nordelta'}`
    : `${catLabel} · ${reservation.sucursal?.name || 'Nordelta'}`;

  const statusConfig = {
    active:                 { label: 'Activa',                                         cls: 'active' },
    pending_payment:        { label: 'Esperando pago',                                 cls: 'pending' },
    payment_failed:         { label: 'Pago fallido',                                   cls: 'failed' },
    cancellation_scheduled: { label: `Cancela el ${reservation.cancelEffectiveDate || '—'}`, cls: 'scheduled' },
    cancelled:              { label: 'Cancelada',                                       cls: 'cancelled' },
  };
  const sc = statusConfig[reservation.status] || { label: reservation.status, cls: 'pending' };

  return (
    <>
      <section className="mc-portal-hero" style={{ paddingBottom: 0 }}>
        <div className="mc-portal-hero-inner" style={{ paddingBottom: 24 }}>
          <a className="mc-res-portal-back" href="#/portal">← Tus espacios</a>
          <div className="mc-res-portal-header">
            <div>
              <h1>{headerTitle}</h1>
              <div style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'rgba(255,255,255,0.5)', letterSpacing: '0.06em', marginTop: 4 }}>
                {reservation.contractNumber ? `CTO-${reservation.contractNumber}` : reservation.id}
                {reservation.startDate && ` · Desde ${reservation.startDate}`}
              </div>
            </div>
            <span className={`mc-portal-status ${sc.cls}`}>{sc.label}</span>
          </div>
        </div>
      </section>

      <div className="mc-res-portal">
        <AccesoFacial reservation={reservation} onUpdate={onUpdate} />
        <ProximoPago reservation={reservation} />
        <HistorialPagos reservation={reservation} />
        <TuEspacio reservation={reservation} m2Label={m2Label} catLabel={catLabel} />
        <Gestionar
          reservation={reservation}
          onUpdate={onUpdate}
          onOpenResize={() => setResizeOpen(true)}
          cancelStep={cancelStep}
          setCancelStep={setCancelStep}
          onReserve={onReserve}
        />
      </div>

      {resizeOpen && (
        <ResizeModal
          reservation={reservation}
          allCategories={allCategories}
          onClose={() => setResizeOpen(false)}
          onUpdate={onUpdate}
        />
      )}
    </>
  );
}

/* ════════════════════════════════════════════════════════════════ */
/* App                                                                */
/* ════════════════════════════════════════════════════════════════ */
// Carga la cuenta real del cliente desde el backend
async function fetchMyAccount(email) {
  if (!email) return null;
  try {
    // Token del Firebase ya cargado en index.html (window._fb). El viejo import() dinámico
    // acá fallaba SIEMPRE (Babel) → salía sin Authorization → 401 → portal vacío para TODOS.
    const token = await _tryGetFirebaseToken();
    if (!token) return { __error: 'no_auth' }; // sin sesión Firebase: avisar, no mentir "sin espacios"
    const headers = { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` };

    const res = await fetch(`${MC_API}/my-account`, { headers });
    if (!res.ok) {
      // No tragarse el motivo: 403 email_not_verified / 401 sesión → el portal lo AVISA.
      if (res.status === 401) return { __error: 'no_auth' };
      try { const err = await res.json(); if (err && err.code) return { __error: err.code }; } catch (e) { /* sin cuerpo */ }
      return null;
    }
    return await res.json();
  } catch (err) {
    console.warn('[portal] Error cargando cuenta:', err);
    return null;
  }
}

function App() {
  const route = useHashRoute();
  const [user, setUser] = useState(store.getUser());
  const [reservations, setReservations] = useState(store.getReservations());
  const [accountData, setAccountData] = useState(null);  // datos reales del backend
  const [accountLoading, setAccountLoading] = useState(false);
  const [wizardOpen, setWizardOpen] = useState(false);
  const [wizardCategory, setWizardCategory] = useState(null);
  const [wizardSucursal, setWizardSucursal] = useState(null);
  const [, setPriceTick] = useState(0);

  // Precios desde el server: la tabla por medida es la fuente de verdad (admin).
  useEffect(() => {
    fetch(`${MC_API}/pricing?branchId=nordelta`).then((r) => r.json()).then((d) => {
      const byM2 = d && d.byM2;
      if (!byM2) return;
      let changed = false;
      CATEGORIES.forEach((c) => (c.options || []).forEach((o) => {
        const v = byM2[String(o.m2)];
        if (typeof v === 'number' && v > 0 && v !== o.monthly) { o.monthly = v; changed = true; }
      }));
      if (changed) setPriceTick((t) => t + 1);
    }).catch(() => {});
  }, []);

  // Cargar datos reales del cliente cuando entra al portal
  useEffect(() => {
    const isPortalRoute = route.name === 'portal' || route.name === 'reservation';
    if (isPortalRoute && user?.email && !accountData && !accountLoading) {
      setAccountLoading(true);
      fetchMyAccount(user.email)
        .then(data => { if (data) setAccountData(data); })
        .finally(() => setAccountLoading(false));
    }
  }, [route.name, user?.email]);

  // Recargar cuando cambia el usuario
  useEffect(() => {
    if (user?.email) {
      setAccountLoading(true);
      fetchMyAccount(user.email)
        .then(data => { if (data) setAccountData(data); })
        .finally(() => setAccountLoading(false));
    } else {
      setAccountData(null);
    }
  }, [user?.email]);

  useEffect(() => {
    const onU = () => setUser(store.getUser());
    const onR = () => setReservations(store.getReservations());
    window.addEventListener('mc:user-change', onU);
    window.addEventListener('mc:reservations-change', onR);
    return () => {
      window.removeEventListener('mc:user-change', onU);
      window.removeEventListener('mc:reservations-change', onR);
    };
  }, []);

  useEffect(() => {
    if (route.openWizard) {
      setWizardOpen(true);
      setWizardCategory(null);
      setWizardSucursal(null);
      window.location.hash = '#/';
      return;
    }
    if (route.name !== 'home') setWizardOpen(false);
  }, [route]);

  useReveal([route.name]);

  const openWizard = (opts = {}) => {
    setWizardCategory(opts.category || null);
    setWizardSucursal(opts.sucursal || null);
    setWizardOpen(true);
  };
  const closeWizard = () => setWizardOpen(false);

  const isPortal = route.name === 'portal' || route.name === 'reservation';
  const showHomeChrome = !isPortal;

  // Contratos reales del backend (prioritarios sobre localStorage)
  const backendContracts = accountData?.contracts || [];
  // Reservas de localStorage (para las hechas online en esta sesión antes de persistir)
  const localReservations = user ? reservations.filter((r) => r.userEmail === user.email) : [];
  // Merge: priorizar backend, agregar locales que no estén en el backend
  const backendIds = new Set(backendContracts.map(c => c.id));
  const mergedReservations = [
    ...backendContracts,
    ...localReservations.filter(r => !backendIds.has(r.id)),
  ];
  const userReservations = mergedReservations;

  return (
    <>
      {!isPortal && <PromoBanner />}
      <Nav onReserve={() => openWizard()} route={route} user={user} />

      {route.name === 'home' && (
        <main id="main">
          <Hero onReserve={() => openWizard()} />
          <Ticker />
          <Sucursales onReserve={(s) => openWizard({ sucursal: s })} />
          <Categorias onReserveCategory={(c) => openWizard({ category: c })} />
          <How />
          <Guarantees onReserve={() => openWizard()} />
          <SelfService onReserve={() => openWizard()} />
          <Testimonials />
          <FAQ />
          <BigCTA onReserve={() => openWizard()} />
        </main>
      )}

      {(route.name === 'portal' || route.name === 'reservation') && (
        <main id="main" className="mc-portal-bg">
          {!user ? (
            <PortalLogin onLogin={(u) => setUser(u)} />
          ) : route.name === 'portal' ? (
            <PortalEntry
              user={user}
              reservations={userReservations}
              accountData={accountData}
              accountLoading={accountLoading}
              onLogout={() => { store.setUser(null); setAccountData(null); window._fb?.signOut?.(); }}
              onReserve={() => openWizard()}
            />
          ) : (
            <ReservationPortal
              reservation={userReservations.find((r) => r.id === route.params.id)}
              user={user}
              initialView={route.params.view}
              onUpdate={store.updateReservation}
              allCategories={CATEGORIES}
              onReserve={() => openWizard()}
            />
          )}
        </main>
      )}

      {showHomeChrome && <Footer onReserve={() => openWizard()} />}

      {showHomeChrome && (
        <a className="mc-wa" style={{ display: 'none' }} href={WHATSAPP} target="_blank" rel="noopener" aria-label="WhatsApp">
          <span className="wa-mark" aria-hidden="true">
            <svg viewBox="0 0 24 24" fill="white" width="22" height="22" aria-hidden="true">
              <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/>
            </svg>
          </span>
          WhatsApp
        </a>
      )}

      {showHomeChrome && (
        <a
          href={ADMIN_URL}
          target="_blank"
          rel="noopener noreferrer"
          className="mc-admin-link"
          title="Panel de administración"
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" width="14" height="14" aria-hidden="true">
            <rect x="3" y="11" width="18" height="11" rx="2" ry="2"/>
            <path d="M7 11V7a5 5 0 0 1 10 0v4"/>
          </svg>
          <span>Acceso interno</span>
        </a>
      )}

      {showHomeChrome && (
        <div className="mc-sticky-bar">
          <a className="mc-sticky-wa" href={WHATSAPP} target="_blank" rel="noopener" aria-label="WhatsApp">
            <svg viewBox="0 0 24 24" fill="white" width="18" height="18" aria-hidden="true">
              <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/>
            </svg>
          </a>
          <div className="lbl">Desde ${fromPrice(CATEGORIES[0]).toLocaleString('es-AR')}/mes<span>5 min · sin permanencia</span></div>
          <button className="mc-btn mc-btn-green" onClick={() => openWizard()}>
            <span>Reservar</span>
            <span className="arrow">→</span>
          </button>
        </div>
      )}

      {wizardOpen && <Wizard initialCategory={wizardCategory} initialSucursal={wizardSucursal} user={user} onClose={closeWizard} />}
    </>
  );
}

window.App = App;
// #12: asesor virtual con Claude (endpoint /chat)
function MCChat() {
  const [open, setOpen] = useState(false);
  const [msgs, setMsgs] = useState([{ role: 'assistant', content: 'Hola! Soy Yamila, de Mi Container 😊 Contame, ¿qué estás buscando guardar? Te paso precios, medidas, disponibilidad o te ayudo a reservar.' }]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const boxRef = useRef(null);
  const [teaser, setTeaser] = useState(true);
  useEffect(() => {
    if (open) { setTeaser(false); return; }
    let timer;
    const SHOW_MS = 6000;   // se muestra ~6s
    const HIDE_MS = 24000;  // se esconde ~24s antes de volver (menos invasivo)
    const cycle = (show) => { setTeaser(show); timer = setTimeout(() => cycle(!show), show ? SHOW_MS : HIDE_MS); };
    cycle(true);            // apenas carga la web, aparece
    return () => clearTimeout(timer);
  }, [open]);
  useEffect(() => { if (boxRef.current) boxRef.current.scrollTop = boxRef.current.scrollHeight; }, [msgs, open, loading]);
  const send = async () => {
    const text = input.trim();
    if (!text || loading) return;
    const next = [...msgs, { role: 'user', content: text }];
    setMsgs(next); setInput(''); setLoading(true);
    try {
      const r = await fetch(`${MC_API}/chat`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ messages: next }) });
      const d = await r.json();
      setMsgs((m) => [...m, { role: 'assistant', content: d.reply || 'Disculpa, no pude responder ahora.' }]);
    } catch (e) {
      setMsgs((m) => [...m, { role: 'assistant', content: 'Hubo un error. Proba de nuevo o escribinos por WhatsApp.' }]);
    } finally { setLoading(false); }
  };
  return (
    <div className="mc-chat-fab" style={{ position: 'fixed', right: 24, bottom: 24, zIndex: 9999 }}>
      {open && (
        <div style={{ width: 340, maxWidth: '90vw', height: 460, maxHeight: '70vh', background: '#fff', borderRadius: 16, boxShadow: '0 12px 40px rgba(0,0,0,0.25)', display: 'flex', flexDirection: 'column', overflow: 'hidden', marginBottom: 12 }}>
          <div style={{ background: 'linear-gradient(135deg, #3D3083, #5ECA00)', color: '#fff', padding: '12px 16px', fontWeight: 700, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span>Yamila · Mi Container</span>
            <button onClick={() => setOpen(false)} style={{ background: 'none', border: 'none', color: '#fff', fontSize: 22, cursor: 'pointer', lineHeight: 1 }} aria-label='Cerrar'>{'\u00d7'}</button>
          </div>
          <div ref={boxRef} style={{ flex: 1, overflowY: 'auto', padding: 12, background: '#f6f6f8' }}>
            {msgs.map((m, i) => (
              <div key={i} style={{ display: 'flex', justifyContent: m.role === 'user' ? 'flex-end' : 'flex-start', marginBottom: 8 }}>
                <span style={{ maxWidth: '82%', padding: '8px 12px', borderRadius: 12, fontSize: 14, lineHeight: 1.4, whiteSpace: 'pre-wrap', background: m.role === 'user' ? '#5ECA00' : '#fff', color: m.role === 'user' ? '#0a0a0a' : '#222', boxShadow: '0 1px 3px rgba(0,0,0,0.08)' }}>{m.content}</span>
              </div>
            ))}
            {loading && <div style={{ fontSize: 13, color: '#888', padding: '4px 8px' }}>escribiendo...</div>}
          </div>
          <div style={{ display: 'flex', gap: 6, padding: 10, borderTop: '1px solid #eee', background: '#fff' }}>
            <input value={input} onChange={(e) => setInput(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') send(); }} placeholder='Escribi tu consulta...' style={{ flex: 1, padding: '9px 11px', borderRadius: 10, border: '1px solid #ccc', fontSize: 14 }} />
            <button onClick={send} disabled={loading || !input.trim()} style={{ background: '#3D3083', color: '#fff', border: 'none', borderRadius: 10, padding: '0 14px', fontWeight: 700, cursor: 'pointer' }} aria-label='Enviar'>{'\u2192'}</button>
          </div>
        </div>
      )}
      {!open && (
        <div onClick={() => setOpen(true)} style={{ position: 'absolute', bottom: 70, right: 0, background: '#fff', color: '#222', padding: '9px 13px', borderRadius: 14, boxShadow: '0 4px 16px rgba(0,0,0,0.18)', fontSize: 13, fontWeight: 600, whiteSpace: 'nowrap', cursor: 'pointer', opacity: teaser ? 1 : 0, transform: teaser ? 'translateY(0)' : 'translateY(6px)', transition: 'opacity .4s, transform .4s', pointerEvents: teaser ? 'auto' : 'none' }}>¿Tenés dudas? Escribime, soy Yamila 😊</div>
      )}
      <button onClick={() => setOpen((o) => !o)} aria-label='Abrir chat con Yamila' style={{ width: 62, height: 62, borderRadius: '50%', background: 'linear-gradient(135deg, #3D3083 0%, #5ECA00 135%)', color: '#fff', border: '2px solid rgba(255,255,255,0.9)', boxShadow: '0 8px 24px rgba(61,48,131,0.45)', cursor: 'pointer', marginLeft: 'auto', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 0 }}>
        {open ? (
          <span style={{ fontSize: 28, lineHeight: 1, fontWeight: 300 }}>×</span>
        ) : (
          <svg width="30" height="30" viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <path d="M12 3C7.03 3 3 6.4 3 10.6c0 1.95.83 3.74 2.2 5.12-.1 1-.43 2.18-1.02 3.18 1.34-.19 2.57-.62 3.56-1.2.96.3 2.01.5 3.06.5h.2c4.97 0 9-3.4 9-7.6S16.97 3 12 3z" fill="white"/>
            <circle cx="8.4" cy="10.6" r="1.25" fill="#3D3083"/>
            <circle cx="12" cy="10.6" r="1.25" fill="#5ECA00"/>
            <circle cx="15.6" cy="10.6" r="1.25" fill="#3D3083"/>
          </svg>
        )}
      </button>
    </div>
  );
}


// Promoción web: cartel emergente configurable desde el admin (por sucursal)
function MCPromo() {
  const [promo, setPromo] = useState(null);
  const [open, setOpen] = useState(false);
  useEffect(() => {
    let seen = false;
    try { seen = sessionStorage.getItem('mc.promoSeen') === '1'; } catch {}
    if (seen) return;
    fetch(`${MC_API}/promo?branchId=nordelta`).then((r) => r.json()).then((d) => {
      if (!d || !d.active) return;
      setPromo(d); setOpen(true);
      try { sessionStorage.setItem('mc.promoSeen', '1'); } catch {}
      if (Number(d.discountPct) > 0) { try { sessionStorage.setItem('mc.viaPromo', '1'); } catch {} }
    }).catch(() => {});
  }, []);
  useEffect(() => {
    if (!open || !promo) return;
    const secs = Math.max(2, Number(promo.autoCloseSec) || 5);
    const id = setTimeout(() => setOpen(false), secs * 1000);
    return () => clearTimeout(id);
  }, [open, promo]);
  if (!open || !promo) return null;
  const FONTS = { cond: "'Roboto Condensed', sans-serif", sans: "'Roboto', sans-serif", mono: "'Roboto Mono', monospace" };
  const anim = ({ fade: 'mcPromoFade .5s ease-out', slide: 'mcPromoSlide .5s ease-out', pulse: 'mcPromoPulse 1.4s ease-in-out infinite' })[promo.animation] || 'none';
  return (
    <div onClick={() => setOpen(false)} style={{ position: 'fixed', inset: 0, zIndex: 10000, background: 'rgba(10,10,10,0.6)', backdropFilter: 'blur(6px)', WebkitBackdropFilter: 'blur(6px)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
      <style>{`@keyframes mcPromoFade{from{opacity:0}to{opacity:1}}@keyframes mcPromoSlide{from{transform:translateY(20px);opacity:0}to{transform:translateY(0);opacity:1}}@keyframes mcPromoPulse{0%,100%{transform:scale(1)}50%{transform:scale(1.03)}}`}</style>
      <div onClick={(e) => e.stopPropagation()} style={{ position: 'relative', width: '100%', maxWidth: 380, borderRadius: 18, overflow: 'hidden', boxShadow: '0 30px 80px rgba(0,0,0,0.5)', background: promo.type === 'text' ? (promo.bgColor || '#fff') : '#fff', animation: anim }}>
        <button onClick={() => setOpen(false)} aria-label="Cerrar" style={{ position: 'absolute', top: 10, right: 10, zIndex: 2, width: 30, height: 30, borderRadius: '50%', border: 'none', background: 'rgba(0,0,0,0.2)', color: '#fff', fontSize: 18, cursor: 'pointer', lineHeight: 1 }}>×</button>
        {promo.type === 'image' && promo.imageData ? (
          <img src={promo.imageData} alt="Promoción" style={{ display: 'block', width: '100%' }} />
        ) : (
          <div style={{ padding: '30px 26px', textAlign: 'center', fontFamily: FONTS[promo.fontFamily] || FONTS.cond, color: promo.color || '#0a0a0a' }}>
            {promo.title && <h3 style={{ fontSize: 26, fontWeight: 800, margin: '0 0 8px', letterSpacing: '-0.02em' }}>{promo.title}</h3>}
            {promo.text && <p style={{ fontSize: 15, lineHeight: 1.5, margin: 0, whiteSpace: 'pre-wrap', opacity: 0.92 }}>{promo.text}</p>}
            {Number(promo.discountPct) > 0 && <div style={{ marginTop: 12, display: 'inline-block', fontSize: 13, fontWeight: 800, padding: '4px 12px', borderRadius: 999, background: promo.color || '#0a0a0a', color: promo.bgColor || '#fff' }}>{promo.discountPct}% OFF</div>}
            {promo.ctaText && <div style={{ marginTop: 16 }}><a href={promo.ctaLink || '#/reservar'} onClick={() => setOpen(false)} style={{ display: 'inline-block', background: '#5ECA00', color: '#fff', fontWeight: 700, fontSize: 14, padding: '10px 18px', borderRadius: 10, textDecoration: 'none' }}>{promo.ctaText} →</a></div>}
          </div>
        )}
      </div>
    </div>
  );
}

ReactDOM.createRoot(document.getElementById('root')).render(<React.Fragment><App /><MCChat /><MCPromo /></React.Fragment>);
