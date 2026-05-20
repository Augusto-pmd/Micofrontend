// Mi Container v6 — categorías con opciones reales (Nordelta prices) + Mercado Pago + Google login
// Brand: Roboto · #5ECA00 · #3D3083 · Manual de Marca Junio 2022

const { useState, useEffect, useMemo, useRef, useCallback } = React;

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
const MERCADOPAGO_PUBLIC_KEY = '';

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
      { m2: 5.10, monthly: 139230 },
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
  { id: 'nordelta',  name: 'Nordelta',      hood: 'GBA Norte', address: 'Av. de los Lagos 7250', hours: 'Lun–Vie 8–17 hs · Sáb 9–13 hs', availability: 'Alta',     scarcity: null                              },
  { id: 'palermo',   name: 'Palermo',       hood: 'CABA',      address: 'Av. Córdoba 4500',      hours: 'Horarios a confirmar',           availability: 'Alta',     scarcity: null                              },
  { id: 'crespo',    name: 'Villa Crespo',  hood: 'CABA',      address: 'Av. Warnes 1280',       hours: 'Horarios a confirmar',           availability: 'Media',    scarcity: 'Pocos espacios disponibles'      },
  { id: 'vlopez',    name: 'Vicente López', hood: 'GBA Norte', address: 'Av. Maipú 2840',        hours: 'Horarios a confirmar',           availability: 'Limitada', scarcity: 'Casi sin lugar · reservá pronto' },
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
    active: true,
    placements: ['exit-intent'],                  // retención silenciosa
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
  // Stylized MP wordmark — light blue + handshake icon
  return (
    <svg viewBox="0 0 80 28" width={size * 4} height={size} aria-hidden="true">
      <rect x="0" y="2" width="22" height="24" rx="12" fill="#009ee3" />
      <path d="M5 14c1.2-2 2.8-3 4.8-3 1.6 0 2.7.5 3.6 1.4l1.2-1.2c1-1 2.2-1.4 3.3-1.2-.5 1.4-1.4 2.5-2.6 3.2.7.9 1 2 .9 3.1-1.6.4-3.2.1-4.4-.9l-1.5 1.5c-1 1-2.4 1.6-3.8 1.6-1.7 0-3.2-.8-3.7-2.3-.4-1.1 0-2.2.7-3.2.4-.6.9-1 1.5-1z" fill="#fff"/>
      <text x="28" y="19" fontFamily="Inter, system-ui, sans-serif" fontWeight="800" fontSize="13" fill="#009ee3" letterSpacing="-0.5">Mercado</text>
      <text x="28" y="29" fontFamily="Inter, system-ui, sans-serif" fontWeight="800" fontSize="13" fill="#1a3263" letterSpacing="-0.5">Pago</text>
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
          <span>· +2.300 clientes</span>
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
            {user ? 'Mi cuenta' : 'Acceso clientes'}
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
        <span className="pill"><span className="dot" />4 sucursales · CABA + GBA Norte</span>
        <span>Desde 2019 · +2.300 clientes</span>
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
          Alquilá un espacio para guardar tus cosas en Buenos Aires. Reservá en 5 minutos, pagás mensual con tarjeta y accedés 24/7 con tu QR — todo online, sin llamar a nadie.
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
          <span className="micro">5 min · sin depósito · 1° mes gratis</span>
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
        <span className="mc-eyebrow violet" style={{ marginBottom: 0 }}>4 sucursales · CABA y GBA Norte · Acceso 24/7</span>
      </div>
      <div className="mc-sucs-strip-list">
        {SUCURSALES.map((s) => (
          <button key={s.id} className={`mc-suc-pill ${s.availability.toLowerCase()}`} onClick={() => onReserve(s)}>
            <span className="name">{s.name}</span>
            <span className="detail">{s.hood} · {s.address}</span>
            {s.scarcity
              ? <span className="badge scarce">{s.scarcity}</span>
              : <span className={`badge avail-${s.availability.toLowerCase()}`}>{s.availability}</span>
            }
          </button>
        ))}
      </div>
    </section>
  );
}

/* ════════════════════════════════════════════════════════════════ */
/* Ticker                                                             */
/* ════════════════════════════════════════════════════════════════ */
function Ticker() {
  const items = ['1° mes gratis', 'Sin depósito', 'Sin permanencia', '20% off anual', 'Acceso 24/7', 'Pagás con Mercado Pago', 'Gestión online'];
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
    { n: '01', t: 'Elegí sucursal y tamaño', d: 'Cuatro ubicaciones, cuatro categorías con opciones reales en m².' },
    { n: '02', t: 'Suscribite con tarjeta',  d: 'Mercado Pago, mensualidad automática. Cinco minutos. Sin depósito.' },
    { n: '03', t: 'Gestionás desde tu cuenta', d: 'Pagos, accesos, facturación — todo en el portal con tu QR digital.' },
  ];
  return (
    <section className="mc-how" id="how">
      <div className="mc-container">
        <div className="mc-how-grid">
          <div className="mc-how-intro" data-reveal>
            <span className="mc-eyebrow violet">Cómo funciona</span>
            <h2>Sin vueltas.<br /><span className="v">Literalmente.</span></h2>
            <p>Diseñamos Mi Container para que vos manejes tu espacio. Online, autogestivo, transparente.</p>
          </div>
          <div className="mc-how-steps" data-reveal>
            {steps.map((s) => (
              <div key={s.n} className="mc-how-step">
                <div className="n">{s.n}</div>
                <div>
                  <h3>{s.t}</h3>
                  <p>{s.d}</p>
                </div>
                <div className="arrow" aria-hidden="true">→</div>
              </div>
            ))}
          </div>
        </div>
      </div>
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
          <h3>Acceso 24/7</h3>
          <p>Entrás cuando quieras, los 365 días del año, con tu credencial digital desde el portal.</p>
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
            <p>Reservá online en cinco minutos. Sin firmas, sin papeleo.</p>
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
            <li>Recibís tu credencial QR al instante</li>
            <li>Sin firmas, sin contratos físicos</li>
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
            <li>Acceso 24/7 con QR digital</li>
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
            <blockquote>Tengo dos boxes — uno en Nordelta y otro en Palermo. Los manejo desde la misma cuenta.</blockquote>
            <figcaption><span className="avatar">TR</span><div><b>Tomás R.</b><span>PyME · Importación</span></div></figcaption>
          </figure>
          <figure data-reveal="3">
            <div className="stars" aria-label="5 estrellas">★★★★★</div>
            <blockquote>Aproveché el primer mes gratis y la mudanza bonificada. Pagué todo por Mercado Pago, sin trámites.</blockquote>
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
    { q: '¿Necesito firmar un contrato largo?', a: 'No. Alquilás mes a mes y cancelás cuando quieras, sin permanencia mínima ni cargos por salida anticipada.' },
    { q: '¿Puedo tener más de un box?',          a: 'Sí. Podés tener tantas reservas como necesites, incluso en distintas sucursales. Las manejás todas desde la misma cuenta.' },
    { q: '¿Cómo pago?',                          a: 'Suscripción mensual con tarjeta de crédito a través de Mercado Pago. Te cobramos automáticamente cada mes mientras tu cuenta esté activa. Cancelás cuando quieras desde el portal. Los precios incluyen IVA.' },
    { q: '¿Cómo accedo al box?',                 a: 'Con un QR personal generado desde tu cuenta. Lo escaneás en el ingreso y entrás. Funciona 24/7.' },
    { q: '¿Cómo aplican las promos?',            a: 'Se aplican automáticamente al hacer la reserva si cumplís los requisitos. El primer mes gratis aplica siempre; la mudanza gratis desde 10 m² al elegir "retiro a domicilio".' },
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
        <h2><span>Guardá hoy.</span><span>Pagá mañana.</span></h2>
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
    return Object.keys(e).length === 0;
  };

  const next = () => {
    if (step === 4) {
      if (!validateData()) return;
      // Simulate MP checkout flow
      setPaying(true);
      setTimeout(() => {
        const u = {
          ...user,
          name: data.name.trim(),
          email: data.email.trim().toLowerCase(),
          phone: data.phone,
          dni: data.dni,
          provider: user?.provider || 'email',
        };
        store.setUser(u);
        const code = generateCode();
        const reservation = {
          id: code,
          userEmail: u.email,
          status: 'active',
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
          promosApplied: promos.map((p) => ({ key: p.key, badge: p.badge, name: p.name })),
          createdAt: new Date().toISOString(),
        };
        store.addReservation(reservation);
        setPaying(false);
        setStep(5);
      }, 1800);
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
              <p className="lead">Elegí la más cercana. Todas tienen los mismos servicios y acceso 24/7.</p>

              <div className="mc-wiz-how-access">
                <span className="lbl">Cómo funciona el acceso</span>
                <div className="steps">
                  <div><span className="n">1</span><span>Reservás online y pagás con tarjeta</span></div>
                  <div><span className="n">2</span><span>Te enviamos un <b>QR personal</b> por email</span></div>
                  <div><span className="n">3</span><span>Lo mostrás en el ingreso y entrás — las 24 hs, sin turno</span></div>
                  <div><span className="n">4</span><span>Gestionás todo (pagos, accesos, facturas) desde tu cuenta online</span></div>
                </div>
              </div>

              <div className="mc-wiz-options sucursales">
                {SUCURSALES.map((s) => (
                  <button
                    key={s.id}
                    type="button"
                    className={`mc-wiz-option ${data.sucursal.id === s.id ? 'selected' : ''}`}
                    onClick={() => setData({ ...data, sucursal: s })}
                  >
                    <span className="name">{s.name}</span>
                    <span className="range">{s.hood} · {s.address}</span>
                    <span className="desc">{s.hours}</span>
                    <span className={`pill-avail ${s.availability.toLowerCase()}`}>Disponibilidad: {s.availability}</span>
                  </button>
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
                    {data.category.options.map((o) => (
                      <button
                        key={o.m2}
                        type="button"
                        className={`mc-wiz-opt ${data.option.m2 === o.m2 ? 'selected' : ''}`}
                        onClick={() => setOption(o)}
                      >
                        <b>{formatM2(o.m2)} m²</b>
                        <span>${o.monthly.toLocaleString('es-AR')} <small>/ mes</small></span>
                      </button>
                    ))}
                  </div>
                  <span className="hint">Precios finales con IVA · Sucursal {data.sucursal.name}</span>
                </div>
              </div>
            </>
          )}

          {step === 2 && (
            <>
              <h2 id="wiz-title">¿Cuándo querés empezar?</h2>
              <p className="lead">Reservás la fecha y el espacio queda apartado a tu nombre.</p>
              <div className="mc-wiz-row2">
                <div className="mc-wiz-field">
                  <label htmlFor="startDate">Fecha de inicio</label>
                  <input id="startDate" type="date" min={today} value={data.startDate} onChange={(e) => setData({ ...data, startDate: e.target.value })} />
                  <span className="hint">Mañana o más adelante.</span>
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
                <div className="row"><span>Duración estimada</span><b>{data.duration} {data.duration === 1 ? 'mes' : 'meses'}</b></div>

                {totals.monthlyDiscount > 0 ? (
                  <div className="row">
                    <span>Mensualidad</span>
                    <b><s style={{ color: 'var(--mc-ink-4)', fontWeight: 500 }}>${totals.monthly.toLocaleString('es-AR')}</s> ${totals.monthlyEff.toLocaleString('es-AR')}</b>
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
                <span className="lbl">Forma de pago</span>
                <div className="mc-wiz-pay-mp">
                  <div className="mp-head">
                    <MercadoPagoLogo size={18} />
                    <span className="featured-tag">Suscripción mensual</span>
                  </div>
                  <b>Tarjeta de crédito vía Mercado Pago</b>
                  <p>Cobro automático cada mes mientras tu cuenta esté activa. Cancelás cuando quieras desde el portal.</p>
                </div>
                <div className="mc-wiz-recurring-note">
                  <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <path d="M21 12a9 9 0 11-3-6.7L21 8" />
                    <path d="M21 3v5h-5" />
                  </svg>
                  <span>Próximos cobros: <b>${Math.round(totals.monthly * (1 - totals.annualPctOff)).toLocaleString('es-AR')}/mes</b>. Primer cobro hoy de ${totals.firstMonth.toLocaleString('es-AR')}.</span>
                </div>
              </div>
            </>
          )}

          {step === 5 && (
            <div className="mc-wiz-success">
              <div className="badge" aria-hidden="true">
                <svg viewBox="0 0 24 24" width="32" height="32" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12l5 5L20 7" /></svg>
              </div>
              <h2>¡Suscripción activa!</h2>
              <p>Te enviamos a <b>{data.email}</b> la credencial digital, la factura y el resumen.</p>
              <div className="code">{store.getReservations()[0]?.id}</div>

              <div className="mc-wiz-next-steps">
                <span className="lbl">¿Qué pasa ahora?</span>
                <div className="step"><span className="n">1</span><span>Te llega un email con tu <b>QR de acceso</b> y el comprobante de pago.</span></div>
                <div className="step"><span className="n">2</span><span>El día <b>{data.startDate}</b> tu espacio queda activo en <b>{data.sucursal.name}</b>.</span></div>
                <div className="step"><span className="n">3</span><span>Ingresás mostrando el QR en el lector de la entrada — sin turno, sin esperar.</span></div>
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
              <div className="logo-big"><MercadoPagoLogo size={32} /></div>
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
            <button className={step === 4 ? 'mc-btn mc-btn-mp' : 'mc-btn mc-btn-green'} onClick={next}>
              {step === 4 ? (
                <>
                  <MercadoPagoLogo size={14} />
                  <span>Suscribirme · ${totals.firstMonth.toLocaleString('es-AR')}</span>
                  <span className="arrow">→</span>
                </>
              ) : (
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
  const [email, setEmail] = useState('');
  const [err, setErr] = useState('');
  const handleEmail = (e) => {
    e.preventDefault();
    if (!/^\S+@\S+\.\S+$/.test(email)) { setErr('Ingresá un email válido'); return; }
    const user = { email: email.toLowerCase(), name: email.split('@')[0], provider: 'email' };
    store.setUser(user);
    onLogin && onLogin(user);
  };
  const handleGoogle = (user) => { store.setUser(user); onLogin && onLogin(user); };
  return (
    <div className="mc-login">
      <div className="mc-login-card">
        <span className="mc-eyebrow violet">Portal cliente</span>
        <h2>Entrá a <span className="v">tu cuenta</span>.</h2>
        <p>Iniciá sesión con Google o con tu email. Sin contraseñas.</p>
        <GoogleButton onSuccess={handleGoogle} />
        <div className="mc-login-divider"><span>o con tu email</span></div>
        <form onSubmit={handleEmail}>
          <div className="mc-wiz-field">
            <label htmlFor="login-email">Email</label>
            <input id="login-email" type="email" value={email} onChange={(e) => { setEmail(e.target.value); setErr(''); }} placeholder="vos@email.com" />
            {err && <span className="err">{err}</span>}
          </div>
          <button type="submit" className="mc-btn mc-btn-violet full">
            <span>Continuar con email</span>
            <span className="arrow">→</span>
          </button>
        </form>
        <a className="mc-login-back" href="#/">← Volver al inicio</a>
      </div>
    </div>
  );
}

function PortalDashboard({ user, reservations, onLogout, onReserve }) {
  const active = reservations.filter((r) => r.status === 'active');
  const totalMonthly = active.reduce((sum, r) => sum + r.monthly, 0);
  const sucursalCount = new Set(active.map((r) => r.sucursal?.id || 'unknown')).size;
  return (
    <>
      <section className="mc-portal-hero">
        <div className="mc-portal-hero-inner">
          <span className="mc-eyebrow on-dark">Portal cliente</span>
          <h1>Hola, <span className="g">{user.name || user.email.split('@')[0]}</span>.</h1>
          <p>Acá vas a ver todas tus reservas, facturas y accesos. Podés tener varios boxes en distintas sucursales gestionados desde la misma cuenta.</p>
        </div>
      </section>
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
                {reservations.map((r, i) => (
                  <a key={r.id} className="mc-res-card" href={`#/portal/r/${r.id}`}>
                    <span className="num">0{i + 1}</span>
                    <div className="info">
                      <b>{r.category?.label || r.size?.label} · {r.option ? `${formatM2(r.option.m2)} m²` : r.size?.range}</b>
                      <span>{r.sucursal?.name || '—'} · {r.sucursal?.hood || ''}</span>
                      <span>Inicio: {r.startDate} · {r.id}</span>
                      <span className={`badge ${r.status === 'active' ? 'active' : r.status === 'cancelled' ? 'cancelled' : 'pending'}`}>{r.status === 'active' ? 'Activa' : r.status === 'cancelled' ? 'Cancelada' : 'Pendiente'}</span>
                      {r.promosApplied && r.promosApplied.length > 0 && (
                        <div className="promos-row">
                          {r.promosApplied.map((p) => <span key={p.key} className="mc-promo-badge green tiny">{p.badge}</span>)}
                        </div>
                      )}
                    </div>
                    <div className="price">
                      ${r.monthly.toLocaleString('es-AR')}
                      <small>por mes</small>
                    </div>
                  </a>
                ))}
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
function PortalEntry({ user, reservations, onLogout, onReserve }) {
  const active = reservations.filter((r) => r.status !== 'cancelled');

  // Auto-redirect when exactly 1 active reservation exists
  useEffect(() => {
    if (active.length === 1) {
      window.location.hash = `#/portal/r/${active[0].id}`;
    }
  }, [active.length, active[0]?.id]);

  // 0 active reservations — empty state
  if (active.length === 0) {
    return (
      <>
        <section className="mc-portal-hero">
          <div className="mc-portal-hero-inner">
            <span className="mc-eyebrow on-dark">Portal cliente</span>
            <h1>Hola, <span className="g">{user.name || user.email.split('@')[0]}</span>.</h1>
          </div>
        </section>
        <div className="mc-res-selector">
          <div className="mc-portal-block" style={{ textAlign: 'center', padding: '48px 24px' }}>
            <div style={{ fontSize: 40, marginBottom: 12 }}>📦</div>
            <h3 style={{ fontFamily: 'var(--font-cond)', fontSize: 22, fontWeight: 900, margin: '0 0 8px' }}>
              Todavía no tenés espacios
            </h3>
            <p style={{ fontSize: 14, color: 'var(--mc-ink-2)', marginBottom: 24 }}>
              Reservá tu primer espacio en menos de 5 minutos.<br />
              Sin depósito · 1° mes gratis.
            </p>
            <button className="mc-btn mc-btn-green" onClick={onReserve}>
              <span>Reservar ahora</span><span className="arrow">→</span>
            </button>
          </div>
          <div style={{ marginTop: 16 }}>
            <button className="mc-btn mc-btn-ghost" onClick={onLogout}><span>Cerrar sesión</span></button>
          </div>
        </div>
      </>
    );
  }

  // 1 reservation — redirect is happening, show loading
  if (active.length === 1) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', padding: '80px 20px' }}>
        <div style={{ fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--mc-ink-4)' }}>
          Cargando tu espacio...
        </div>
      </div>
    );
  }

  // 2+ reservations — selector
  return (
    <>
      <section className="mc-portal-hero">
        <div className="mc-portal-hero-inner">
          <span className="mc-eyebrow on-dark">Portal cliente</span>
          <h1>Hola, <span className="g">{user.name || user.email.split('@')[0]}</span>.</h1>
          <p>Elegí el espacio que querés gestionar.</p>
        </div>
      </section>
      <div className="mc-res-selector">
        <h2>Tus espacios</h2>
        <div className="mc-res-selector-grid">
          {reservations.map((r) => {
            const statusMap = {
              active: 'Activa', pending_payment: 'Pendiente de pago',
              cancelled: 'Cancelada', payment_failed: 'Pago fallido',
              cancellation_scheduled: 'Cancelación programada',
            };
            return (
              <a key={r.id} className="mc-res-selector-card" href={`#/portal/r/${r.id}`}>
                <div className="info">
                  <b>{r.category?.label || r.size?.label} · {r.option ? `${formatM2(r.option.m2)} m²` : r.size?.range}</b>
                  <span>{r.sucursal?.name} · {statusMap[r.status] || r.status}</span>
                </div>
                <span className="arrow">→</span>
              </a>
            );
          })}
          <button className="mc-btn mc-btn-ghost" onClick={onReserve} style={{ marginTop: 8 }}>
            <span>+ Nueva reserva</span>
          </button>
        </div>
        <div style={{ marginTop: 24 }}>
          <button className="mc-btn mc-btn-ghost" onClick={onLogout}><span>Cerrar sesión</span></button>
        </div>
      </div>
    </>
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

  const nextDate = calcNextPayment();
  const monthly = reservation.monthly || 0;
  const isFailed = reservation.status === 'payment_failed';

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
      {!isFailed && (
        <>
          <div className="mc-pago-amount">${monthly.toLocaleString('es-AR')}<small>/ mes</small></div>
          <div className="mc-pago-next">Próximo cobro: {nextDate}</div>
        </>
      )}
      {mockHistory.length > 0 && (
        <div className="mc-pago-history">
          <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--mc-ink-4)', marginBottom: 10 }}>
            Historial
          </div>
          {mockHistory.map((row, i) => (
            <div key={i} className="mc-pago-row">
              <span>
                {row.label}
                {row.promoLabel && <span style={{ marginLeft: 6, color: 'var(--mc-green-ink)', fontFamily: 'var(--font-mono)', fontSize: 10 }}>{row.promoLabel}</span>}
              </span>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <b>${row.amount.toLocaleString('es-AR')}</b>
                <a href="#" onClick={(e) => e.preventDefault()}>ver factura ↗</a>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function TuEspacio({ reservation, m2Label, catLabel }) {
  const addonNames = (reservation.addons || [])
    .map((k) => ADDONS.find((a) => a.key === k)?.name)
    .filter(Boolean);

  return (
    <div className="mc-portal-block mc-espacio">
      <span className="mc-portal-block-title">Tu espacio</span>
      <div className="mc-espacio-grid">
        <div className="mc-espacio-item">
          <span className="lbl">Espacio</span>
          <b>{catLabel} · {m2Label}</b>
        </div>
        <div className="mc-espacio-item">
          <span className="lbl">Sucursal</span>
          <b>{reservation.sucursal?.name}</b>
          <span>{reservation.sucursal?.address}</span>
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
  const fileRef = useRef(null);

  const handleFile = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => setPhotoPreview(ev.target.result);
    reader.readAsDataURL(file);
  };

  const handleSend = () => {
    onUpdate(reservation.id, { faceEnrollStatus: 'queued' });
    setStep(3);
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
              <b>Acepto el uso de mis datos biométricos</b> exclusivamente para el control de acceso al local de Mi Container (CORDIS MS SA). Mi foto se usa para registrar mi cara en el sistema Hikvision del local y se elimina de los servidores dentro de las 24 hs. El dato biométrico reside únicamente en el dispositivo de acceso.
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
          <p style={{ fontSize: 14, color: 'var(--mc-ink-1)', fontWeight: 600, marginBottom: 12 }}>
            Sacate una foto o subí una imagen
          </p>
          <div className="mc-enroll-photo" onClick={() => fileRef.current?.click()} style={{ cursor: 'pointer' }}>
            {photoPreview
              ? <img src={photoPreview} alt="Vista previa" className="mc-enroll-preview" />
              : <span style={{ fontSize: 28 }}>📷</span>
            }
            <p>{photoPreview ? 'Tocá para cambiar' : 'Tocá para elegir foto'}</p>
            <div className="mc-enroll-photo-req">
              Cara centrada · buena iluminación · sin anteojos de sol · mínimo 640×480px
            </div>
          </div>
          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            capture="user"
            onChange={handleFile}
            style={{ display: 'none' }}
          />
          <div style={{ display: 'flex', gap: 10, marginTop: 14 }}>
            <button
              className="mc-btn mc-btn-violet"
              disabled={!photoPreview}
              onClick={handleSend}
            >
              <span>Enviar foto →</span>
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
        <p>Podés entrar las 24 hs. Tu cara es tu credencial.</p>
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

function ReservationPortal({ reservation, user, initialView, onUpdate, allCategories, onReserve }) {
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
  const m2Label = reservation.option ? `${formatM2(reservation.option.m2)} m²` : reservation.size?.range || '—';

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
              <h1>{catLabel} <span className="g">· {reservation.sucursal?.name}</span></h1>
              <div style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'rgba(255,255,255,0.5)', letterSpacing: '0.06em' }}>
                {reservation.id}
              </div>
            </div>
            <span className={`mc-portal-status ${sc.cls}`}>{sc.label}</span>
          </div>
        </div>
      </section>

      <div className="mc-res-portal">
        <AccesoFacial reservation={reservation} onUpdate={onUpdate} />
        <ProximoPago reservation={reservation} />
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
function App() {
  const route = useHashRoute();
  const [user, setUser] = useState(store.getUser());
  const [reservations, setReservations] = useState(store.getReservations());
  const [wizardOpen, setWizardOpen] = useState(false);
  const [wizardCategory, setWizardCategory] = useState(null);
  const [wizardSucursal, setWizardSucursal] = useState(null);

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
  const userReservations = user ? reservations.filter((r) => r.userEmail === user.email) : [];

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
            <PortalLogin />
          ) : route.name === 'portal' ? (
            <PortalEntry
              user={user}
              reservations={userReservations}
              onLogout={() => { store.setUser(null); window._fb?.signOut(); }}
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
        <a className="mc-wa" href={WHATSAPP} target="_blank" rel="noopener" aria-label="WhatsApp">
          <span className="wa-mark" aria-hidden="true">
            <svg viewBox="0 0 24 24" fill="white" width="22" height="22" aria-hidden="true">
              <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/>
            </svg>
          </span>
          WhatsApp
        </a>
      )}

      {showHomeChrome && (
        <div className="mc-sticky-bar">
          <a className="mc-sticky-wa" href={WHATSAPP} target="_blank" rel="noopener" aria-label="WhatsApp">
            <svg viewBox="0 0 24 24" fill="white" width="18" height="18" aria-hidden="true">
              <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/>
            </svg>
          </a>
          <div className="lbl">Desde ${fromPrice(CATEGORIES[0]).toLocaleString('es-AR')}/mes<span>5 min · 1° mes gratis</span></div>
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
ReactDOM.createRoot(document.getElementById('root')).render(<App />);
