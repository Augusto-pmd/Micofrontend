// Mi Container v6 — categorías con opciones reales (Nordelta prices) + Mercado Pago + Google login
// Brand: Roboto · #5ECA00 · #3D3083 · Manual de Marca Junio 2022

const { useState, useEffect, useMemo, useRef, useCallback } = React;

// ─────────────────────────────────────────────────────────────────
// Contacto real (del flyer Mayo 2026)
// ─────────────────────────────────────────────────────────────────
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
    blurb: 'Cajas, bicis, archivo personal.',
    fits: ['~20 cajas', '2 bicis', 'Objetos estacionales'],
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
    blurb: 'Un monoambiente o estudio.',
    fits: ['Monoambiente', 'Electrodomésticos', 'Muebles de un cuarto'],
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
    blurb: 'Casa de 2 ambientes o stock PyME.',
    fits: ['Casa 2 ambientes', 'Stock e-commerce', '3–5 pallets'],
    options: [
      { m2: 11.25, monthly: 259875 },
      { m2: 13.50, monthly: 283500 },
    ],
  },
  {
    key: 'xl',
    label: 'XL',
    range: '15+ m²',
    blurb: 'Mudanzas completas, logística.',
    fits: ['Casa familiar', 'Operación logística', 'A medida'],
    options: [
      { m2: 15.00, monthly: 441000 },
    ],
  },
];

const fromPrice = (cat) => Math.min(...cat.options.map((o) => o.monthly));
const maxM2 = (cat) => Math.max(...cat.options.map((o) => o.m2));
const formatM2 = (m2) => m2.toLocaleString('es-AR', { minimumFractionDigits: m2 % 1 === 0 ? 0 : 2 });

const SUCURSALES = [
  { id: 'nordelta',  name: 'Nordelta',        hood: 'GBA Norte', address: 'Av. de los Lagos 7250',  hours: 'Acceso 24/7', availability: 'Alta'     },
  { id: 'palermo',   name: 'Palermo',         hood: 'CABA',      address: 'Av. Córdoba 4500',       hours: 'Acceso 24/7', availability: 'Alta'     },
  { id: 'crespo',    name: 'Villa Crespo',    hood: 'CABA',      address: 'Av. Warnes 1280',        hours: 'Acceso 24/7', availability: 'Media'    },
  { id: 'vlopez',    name: 'Vicente López',   hood: 'GBA Norte', address: 'Av. Maipú 2840',         hours: 'Acceso 24/7', availability: 'Limitada' },
];

const ADDONS = [
  { key: 'pickup',   name: 'Retiro a domicilio',  desc: 'Vamos a buscar tus cosas (CABA y GBA).', cost: 32500 },
  { key: 'pack',     name: 'Kit de embalaje',     desc: 'Cajas, cinta y film stretch para 10 m³.', cost: 14500 },
  { key: 'lock',     name: 'Candado certificado', desc: 'De acero, anti-corte. Lo dejás vos.',     cost: 9200  },
  { key: 'insure',   name: 'Seguro extendido',    desc: 'Cobertura hasta $2.000.000 por daños.',   cost: 8900  },
];

const PROMOS = [
  {
    key: 'first-month-free',
    badge: '1° mes gratis',
    name: 'Primer mes gratis',
    description: 'Tu primer mes sin cargo. Aplica en todas las sucursales y tamaños.',
    color: 'green',
    bannerOrder: 0,
    eligible: () => true,
    apply: (t) => ({ ...t, monthlyDiscount: t.monthly }),
  },
  {
    key: 'free-pickup-10m2',
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
    badge: '20% off anual',
    name: '20% off al pagar anual',
    description: 'Pagás 12 meses por adelantado y te ahorrás un 20%.',
    color: 'green',
    bannerOrder: 2,
    eligible: (d) => d.duration >= 12,
    apply: (t) => ({ ...t, annualPctOff: 0.2 }),
  },
];

function activePromos(data) {
  return PROMOS.filter((p) => p.eligible(data));
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
    if (segs[0] === 'portal' && segs[1] === 'r' && segs[2]) return { name: 'reservation', params: { id: segs[2] } };
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
function Isologo({ size = 36 }) {
  return (
    <svg viewBox="0 0 40 40" width={size} height={size} aria-hidden="true">
      <rect x="3"  y="3"  width="24" height="24" rx="1" fill="none" stroke="#3D3083" strokeWidth="2.4" />
      <rect x="13" y="13" width="24" height="24" rx="1" fill="none" stroke="#0a0a0a" strokeWidth="2.4" />
      <rect x="13" y="13" width="14" height="14" fill="#5ECA00" />
      <path d="M17.5 19v-1.2a2.5 2.5 0 015 0V19" stroke="#0a0a0a" strokeWidth="1.6" fill="none" strokeLinecap="round" />
      <rect x="16.5" y="19" width="7" height="5" rx="0.6" fill="#0a0a0a" />
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
function PromoBanner() {
  const [dismissed, setDismissed] = useState(store.isPromoDismissed());
  useEffect(() => {
    const onChange = () => setDismissed(store.isPromoDismissed());
    window.addEventListener('mc:promo-change', onChange);
    return () => window.removeEventListener('mc:promo-change', onChange);
  }, []);
  if (dismissed) return null;
  const featured = [...PROMOS].sort((a, b) => a.bannerOrder - b.bannerOrder).slice(0, 3);
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
          <span className="mc-logo-type">m<span className="i">i</span><b>container</b></span>
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
          Self-storage en Buenos Aires. Reservá tu espacio online en 5 minutos, pagá con Mercado Pago, accedé 24/7 con tu QR — todo desde tu cuenta.
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

      <div className="mc-hero-figure" data-reveal>
        <div className="item lead">
          <b>4.9</b>
          <div className="stars" aria-label="4.9 de 5 estrellas">★★★★★</div>
          <div className="sub">+2.300 reseñas verificadas · Google</div>
        </div>
        <div className="item">
          <b>24/7</b>
          <div className="sub">Acceso todos los días del año, sin reservar turno.</div>
        </div>
        <div className="item">
          <b>4</b>
          <div className="sub">Sucursales en CABA + GBA Norte. Elegís la más cercana.</div>
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
    <section className="mc-sucs mc-container" id="sucursales">
      <div className="mc-sec-head" data-reveal>
        <span className="mc-eyebrow violet">Sucursales</span>
        <h2>Cuatro <span className="v">ubicaciones</span> en Buenos Aires.</h2>
        <p>Elegí la más cercana a tu casa, oficina o depósito. Mismas tarifas, mismos servicios, mismo acceso 24/7.</p>
      </div>
      <div className="mc-sucs-grid" data-reveal>
        {SUCURSALES.map((s, i) => (
          <article key={s.id} className="mc-suc-card">
            <div className="mc-suc-num">0{i + 1}</div>
            <h3>{s.name}</h3>
            <span className="hood">{s.hood}</span>
            <p className="addr">{s.address}</p>
            <div className="mc-suc-meta">
              <span><b>{s.hours}</b></span>
              <span className={`avail ${s.availability.toLowerCase()}`}>Disponibilidad: <b>{s.availability}</b></span>
            </div>
            <button className="mc-btn mc-btn-green" onClick={() => onReserve(s)}>
              <span>Reservar acá</span>
              <span className="arrow">→</span>
            </button>
          </article>
        ))}
      </div>
    </section>
  );
}

/* ════════════════════════════════════════════════════════════════ */
/* Ticker                                                             */
/* ════════════════════════════════════════════════════════════════ */
function Ticker() {
  const items = ['1° mes gratis', 'Sin depósito', 'Sin permanencia', 'Mudanza gratis +10m²', '20% off anual', 'Acceso 24/7', 'Pagás con Mercado Pago'];
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
        <p>Cada categoría tiene varios tamaños exactos en m². Pagás mes a mes, con IVA incluido. Cambiás de tamaño desde el portal sin penalidad.</p>
      </div>

      <div className="mc-cats" data-reveal>
        {CATEGORIES.map((c, i) => {
          const eligible = PROMOS.filter((p) => p.eligible({ category: c, option: c.options[c.options.length - 1], duration: 12, addons: ['pickup'] }));
          return (
            <article key={c.key} className="mc-cat-card">
              <div className="mc-cat-head">
                <div>
                  <span className="num">0{i + 1}</span>
                  <h3>{c.label}</h3>
                  <span className="range">{c.range}</span>
                </div>
                <div className="mc-cat-price">
                  <span className="from">Desde</span>
                  <b>${fromPrice(c).toLocaleString('es-AR')}</b>
                  <span className="unit">/ mes</span>
                </div>
              </div>
              <p className="blurb">{c.blurb}</p>
              <div className="mc-cat-fits">
                {c.fits.map((f, j) => <span key={j}>{f}</span>)}
              </div>
              <div className="mc-cat-options">
                <span className="lbl">Opciones de m²</span>
                <div className="opts">
                  {c.options.map((o) => (
                    <span key={o.m2} className="opt">
                      <b>{formatM2(o.m2)} m²</b>
                      <span>${o.monthly.toLocaleString('es-AR')}</span>
                    </span>
                  ))}
                </div>
              </div>
              {eligible.length > 0 && (
                <div className="mc-cat-promos">
                  {eligible.map((p) => <span key={p.key} className={`mc-promo-badge ${p.color}`}>{p.badge}</span>)}
                </div>
              )}
              <button className="mc-btn mc-btn-green mc-cat-cta" onClick={() => onReserveCategory(c)}>
                <span>Reservar {c.label.toLowerCase()}</span>
                <span className="arrow">→</span>
              </button>
            </article>
          );
        })}
      </div>

      <p className="mc-cats-foot">Precios finales con IVA incluido. Sucursal de referencia: Nordelta. Otras sucursales pueden tener tarifas diferentes según disponibilidad.</p>
    </section>
  );
}

/* ════════════════════════════════════════════════════════════════ */
/* How                                                                */
/* ════════════════════════════════════════════════════════════════ */
function How() {
  const steps = [
    { n: '01', t: 'Elegí sucursal y tamaño', d: 'Cuatro ubicaciones, cuatro categorías con opciones reales en m².' },
    { n: '02', t: 'Pagás con Mercado Pago',  d: 'Cinco minutos. Tarjeta, débito o transferencia. Sin depósito.' },
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
            <li>Pagás con Mercado Pago (tarjeta, débito o transferencia)</li>
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
    { q: '¿Cómo pago?',                          a: 'Por Mercado Pago. Aceptamos tarjeta de crédito, débito, transferencia y dinero en cuenta. Los precios incluyen IVA.' },
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
            <span className="mc-logo-type">m<span className="i">i</span><b>container</b></span>
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
    payment: 'mp',
  });
  const [errors, setErrors] = useState({});

  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape' && step < 5 && !paying) onClose(); };
    document.addEventListener('keydown', onKey);
    document.body.style.overflow = 'hidden';
    return () => { document.removeEventListener('keydown', onKey); document.body.style.overflow = ''; };
  }, [step, onClose, paying]);

  const today = useMemo(() => { const d = new Date(); d.setDate(d.getDate() + 1); return d.toISOString().split('T')[0]; }, []);
  useEffect(() => { if (!data.startDate) setData((d) => ({ ...d, startDate: today })); }, [today]);

  const totals = useMemo(() => computeTotals(data), [data]);
  const promos = activePromos(data);

  const toggleAddon = (k) => setData((d) => ({
    ...d, addons: d.addons.includes(k) ? d.addons.filter((x) => x !== k) : [...d.addons, k],
  }));

  const setCategory = (c) => setData((d) => ({ ...d, category: c, option: c.options[0] }));
  const setOption   = (o) => setData((d) => ({ ...d, option: o }));

  const validateData = () => {
    const e = {};
    if (!data.name.trim() || data.name.trim().length < 2) e.name = 'Ingresá tu nombre';
    if (!/^\S+@\S+\.\S+$/.test(data.email)) e.email = 'Email inválido';
    if (!/^[\d\s\-+()]{8,}$/.test(data.phone)) e.phone = 'Teléfono inválido';
    if (!/^\d{7,9}$/.test(data.dni.replace(/\D/g, ''))) e.dni = 'DNI inválido';
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
    <div className="mc-wiz-back" onClick={step < 5 && !paying ? onClose : undefined} role="dialog" aria-modal="true" aria-labelledby="wiz-title">
      <div className="mc-wiz" onClick={(e) => e.stopPropagation()}>
        {step < 5 && (
          <>
            <div className="mc-wiz-head">
              <div className="step-info">Paso <b>{step + 1}</b> de <b>{totalSteps}</b> · Reservar online</div>
              <button className="close" onClick={onClose} aria-label="Cerrar" disabled={paying}>
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

              <div className="mc-wiz-summary">
                <h4>Resumen</h4>
                <div className="row"><span>Sucursal</span><b>{data.sucursal.name} · {data.sucursal.hood}</b></div>
                <div className="row"><span>Espacio</span><b>{data.category.label} · {formatM2(data.option.m2)} m²</b></div>
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

              <div className="mc-wiz-pay">
                <span className="lbl">Forma de pago</span>
                <button
                  type="button"
                  className={`mc-wiz-pay-opt mp ${data.payment === 'mp' ? 'selected' : ''}`}
                  onClick={() => setData({ ...data, payment: 'mp' })}
                >
                  <span className="radio">{data.payment === 'mp' && <span className="dot" />}</span>
                  <span className="body">
                    <b>Mercado Pago</b>
                    <span>Tarjeta de crédito, débito, transferencia o dinero en cuenta.</span>
                  </span>
                  <span className="logo"><MercadoPagoLogo size={16} /></span>
                  <span className="featured-tag">Recomendado</span>
                </button>
                <button
                  type="button"
                  className={`mc-wiz-pay-opt ${data.payment === 'transfer' ? 'selected' : ''}`}
                  onClick={() => setData({ ...data, payment: 'transfer' })}
                >
                  <span className="radio">{data.payment === 'transfer' && <span className="dot" />}</span>
                  <span className="body">
                    <b>Transferencia bancaria</b>
                    <span>Te enviamos CBU y alias por email para que transfieras.</span>
                  </span>
                </button>
              </div>
            </>
          )}

          {step === 5 && (
            <div className="mc-wiz-success">
              <div className="badge" aria-hidden="true">
                <svg viewBox="0 0 24 24" width="32" height="32" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12l5 5L20 7" /></svg>
              </div>
              <h2>¡Reserva confirmada!</h2>
              <p>Te mandamos un email a <b>{data.email}</b> con tu credencial digital, la factura y el resumen.</p>
              <div className="code">{store.getReservations()[0]?.id}</div>
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

        {step < 5 && !paying && (
          <div className="mc-wiz-foot">
            {step > 0 ? (
              <button className="mc-btn mc-btn-ghost" onClick={back}><span>← Atrás</span></button>
            ) : <span />}
            <button className={step === 4 && data.payment === 'mp' ? 'mc-btn mc-btn-mp' : 'mc-btn mc-btn-green'} onClick={next}>
              {step === 4 ? (
                data.payment === 'mp' ? (
                  <>
                    <MercadoPagoLogo size={14} />
                    <span>Pagar ${totals.firstMonth.toLocaleString('es-AR')}</span>
                    <span className="arrow">→</span>
                  </>
                ) : (
                  <><span>Confirmar reserva</span><span className="arrow">→</span></>
                )
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
  const realRef = useRef(null);
  const [demoOpen, setDemoOpen] = useState(false);
  useEffect(() => {
    if (!GOOGLE_CLIENT_ID) return;
    let canceled = false;
    const init = () => {
      if (canceled || !window.google?.accounts?.id || !realRef.current) return;
      try {
        window.google.accounts.id.initialize({
          client_id: GOOGLE_CLIENT_ID,
          callback: (response) => {
            const info = decodeJWT(response.credential);
            if (!info) return;
            onSuccess({ email: info.email, name: info.name, picture: info.picture, provider: 'google' });
          },
        });
        window.google.accounts.id.renderButton(realRef.current, {
          type: 'standard', theme: 'outline', size: 'large',
          text: 'continue_with', shape: 'pill',
          width: realRef.current.offsetWidth || 320,
        });
      } catch (e) { console.warn('GIS init failed', e); }
    };
    if (window.google?.accounts?.id) init();
    else {
      const t = setInterval(() => { if (window.google?.accounts?.id) { clearInterval(t); init(); } }, 200);
      setTimeout(() => clearInterval(t), 5000);
    }
    return () => { canceled = true; };
  }, [onSuccess]);

  if (GOOGLE_CLIENT_ID) return <div ref={realRef} className="mc-google-real"></div>;

  return (
    <>
      <button type="button" className="mc-google-btn" onClick={() => setDemoOpen(true)}>
        <svg viewBox="0 0 48 48" width="18" height="18" aria-hidden="true">
          <path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3c-1.6 4.6-6 8-11.3 8-6.6 0-12-5.4-12-12s5.4-12 12-12c3 0 5.8 1.1 7.9 3l5.7-5.7C34.1 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.3-.4-3.5z" />
          <path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.6 16 19 13 24 13c3 0 5.8 1.1 7.9 3l5.7-5.7C34.1 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z" />
          <path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2c-2 1.5-4.5 2.4-7.2 2.4-5.3 0-9.7-3.4-11.3-8l-6.5 5C9.5 39.6 16.2 44 24 44z" />
          <path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.1-4.1 5.6l6.2 5.2C41 35.5 44 30.2 44 24c0-1.3-.1-2.3-.4-3.5z" />
        </svg>
        <span>Continuar con Google</span>
      </button>
      {demoOpen && <GoogleDemoPicker onPick={onSuccess} onClose={() => setDemoOpen(false)} />}
    </>
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
                <span className="sub">Próximo cobro por Mercado Pago</span>
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

function ReservationDetail({ reservation, user, onUpdate }) {
  if (!reservation) {
    return (
      <div className="mc-portal">
        <div className="mc-portal-card" style={{ textAlign: 'center', padding: 56 }}>
          <h3>Reserva no encontrada</h3>
          <p style={{ marginTop: 12 }}>El código no coincide con ninguna reserva tuya.</p>
          <a className="mc-btn mc-btn-violet" href="#/portal" style={{ marginTop: 18 }}><span>← Volver al portal</span></a>
        </div>
      </div>
    );
  }
  const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?data=${encodeURIComponent(reservation.id + '|' + user.email)}&size=220x220&bgcolor=f7f4ec&color=3D3083&margin=0`;
  const addonNames = (reservation.addons || []).map((k) => ADDONS.find((a) => a.key === k)?.name).filter(Boolean);
  const m2 = reservation.option ? `${formatM2(reservation.option.m2)} m²` : reservation.size?.range || '—';
  const catLabel = reservation.category?.label || reservation.size?.label || '—';
  const cancel = () => {
    if (!confirm('¿Cancelar esta reserva? Va a quedar marcada como cancelada con efecto en 7 días.')) return;
    onUpdate(reservation.id, { status: 'cancelled' });
  };
  return (
    <>
      <section className="mc-portal-hero">
        <div className="mc-portal-hero-inner">
          <a className="mc-eyebrow on-dark" href="#/portal" style={{ marginBottom: 14 }}>← Tus reservas</a>
          <h1>{catLabel} <span className="g">· {reservation.sucursal?.name}</span></h1>
          <p>{reservation.category?.blurb || reservation.size?.blurb}</p>
        </div>
      </section>
      <div className="mc-portal">
        <div className="mc-res-detail">
          <div className="mc-res-detail-head">
            <div>
              <h2>{catLabel} · {m2}</h2>
              <div className="code">{reservation.id}</div>
            </div>
            <span className={`mc-res-status ${reservation.status === 'active' ? 'active' : reservation.status === 'cancelled' ? 'cancelled' : 'pending'}`}>{reservation.status === 'active' ? 'Activa' : reservation.status === 'cancelled' ? 'Cancelada' : 'Pendiente'}</span>
          </div>
          {reservation.promosApplied && reservation.promosApplied.length > 0 && (
            <div className="mc-res-promos">
              <span className="lbl">Promos aplicadas</span>
              {reservation.promosApplied.map((p) => <span key={p.key} className="mc-promo-badge green">{p.badge}</span>)}
            </div>
          )}
          <div className="mc-res-detail-grid">
            <div className="col">
              <h4>Sucursal</h4>
              <p>
                <b>{reservation.sucursal?.name}</b> · {reservation.sucursal?.hood}<br />
                {reservation.sucursal?.address}<br />
                {reservation.sucursal?.hours}
              </p>
              <h4 style={{ marginTop: 20 }}>Detalles</h4>
              <p>
                <b>Espacio:</b> {catLabel} · {m2}<br />
                <b>Inicio:</b> {reservation.startDate}<br />
                <b>Duración estimada:</b> {reservation.duration} {reservation.duration === 1 ? 'mes' : 'meses'}<br />
                <b>Mensualidad:</b> ${reservation.monthly.toLocaleString('es-AR')}<br />
                {addonNames.length > 0 && <><b>Add-ons:</b> {addonNames.join(', ')}<br /></>}
                <b>Primer pago:</b> ${reservation.firstMonth.toLocaleString('es-AR')}<br />
                <b>Pago:</b> {reservation.payment === 'mp' ? 'Mercado Pago' : reservation.payment === 'transfer' ? 'Transferencia' : 'Otro'}<br />
                <b>Creada:</b> {new Date(reservation.createdAt).toLocaleDateString('es-AR')}
              </p>
            </div>
            <div className="col">
              <h4>Credencial de acceso</h4>
              <div className="mc-res-qr">
                <img src={qrUrl} alt="Código QR de acceso" width="220" height="220" />
                <div className="lbl">Mostrá este QR al ingresar a {reservation.sucursal?.name}</div>
              </div>
            </div>
          </div>
          <div className="mc-res-detail-actions">
            <button className="mc-btn mc-btn-green"><span>Descargar factura</span><span className="arrow">→</span></button>
            <button className="mc-btn mc-btn-ghost-violet"><span>Cambiar de tamaño</span></button>
            <button className="mc-btn mc-btn-ghost"><span>Pausar</span></button>
            {reservation.status === 'active' && (
              <button className="mc-btn mc-btn-ghost" onClick={cancel} style={{ color: '#a91f0a', borderColor: '#a91f0a' }}><span>Cancelar reserva</span></button>
            )}
          </div>
        </div>
      </div>
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

      {route.name === 'portal' && (
        <main id="main" className="mc-portal-bg">
          {user
            ? <PortalDashboard user={user} reservations={userReservations} onLogout={() => store.setUser(null)} onReserve={() => openWizard()} />
            : <PortalLogin />
          }
        </main>
      )}

      {route.name === 'reservation' && (
        <main id="main" className="mc-portal-bg">
          {user
            ? <ReservationDetail reservation={userReservations.find((r) => r.id === route.params.id)} user={user} onUpdate={store.updateReservation} />
            : <PortalLogin />
          }
        </main>
      )}

      {showHomeChrome && <Footer onReserve={() => openWizard()} />}

      {showHomeChrome && (
        <a className="mc-wa" href={WHATSAPP} target="_blank" rel="noopener" aria-label="WhatsApp">
          <span className="wa-mark" aria-hidden="true">
            <svg viewBox="0 0 32 32" fill="currentColor" xmlns="http://www.w3.org/2000/svg">
              <path d="M16.004 3C8.82 3 3 8.82 3 16.004c0 2.29.6 4.53 1.74 6.507L3 29l6.63-1.725A12.96 12.96 0 0016.004 29C23.19 29 29 23.19 29 16.004 29 8.82 23.19 3 16.004 3zm6.78 16.49c-.37-.19-2.2-1.08-2.54-1.2-.34-.13-.59-.19-.84.19s-.96 1.2-1.18 1.45c-.22.25-.43.28-.8.09-.37-.19-1.57-.58-2.99-1.84-1.11-.98-1.85-2.2-2.07-2.57-.22-.37-.02-.57.16-.76.17-.17.37-.43.56-.65.19-.22.25-.37.37-.62.12-.25.06-.46-.03-.65-.09-.19-.84-2.02-1.15-2.77-.3-.73-.61-.63-.84-.64-.22-.01-.46-.01-.71-.01-.25 0-.65.09-.99.46-.34.37-1.3 1.27-1.3 3.1 0 1.83 1.33 3.6 1.51 3.85.19.25 2.61 3.99 6.33 5.6.88.38 1.57.6 2.11.77.88.28 1.69.24 2.33.15.71-.11 2.2-.9 2.51-1.77.31-.87.31-1.61.22-1.77z" />
            </svg>
          </span>
          WhatsApp
        </a>
      )}

      {showHomeChrome && (
        <div className="mc-sticky-bar">
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
