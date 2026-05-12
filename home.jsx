// Mi Container v4 — Brand Manual compliant + self-service
// Roboto · #5ECA00 · #3D3083 · Hash-router · Reservation wizard · Client portal

const { useState, useEffect, useMemo, useRef, useCallback } = React;

const PHONE = '(011) 4301-6001';
const WHATSAPP = 'https://wa.me/5491143016001';

const SIZES = [
  { key: 'chico',   label: 'Pequeño', range: '1–3 m²',  from: 13500, blurb: 'Cajas, bicis, archivo personal.',     fits: ['~20 cajas', '2 bicis', 'Objetos estacionales'] },
  { key: 'mediano', label: 'Mediano', range: '3–9 m²',  from: 24900, blurb: 'Un monoambiente o estudio.',          fits: ['Monoambiente', 'Electrodomésticos', 'Muebles de un cuarto'] },
  { key: 'grande',  label: 'Grande',  range: '9–15 m²', from: 42000, blurb: 'Casa de 2 ambientes o stock PyME.',   fits: ['Casa 2 ambientes', 'Stock e-commerce', '3–5 pallets'] },
  { key: 'xl',      label: 'XL',      range: '15+ m²',  from: 68000, blurb: 'Mudanzas completas, logística.',      fits: ['Casa familiar', 'Operación logística', 'A medida'] },
];

const ADDONS = [
  { key: 'pickup',   name: 'Retiro a domicilio',  desc: 'Vamos a buscar tus cosas (CABA y GBA).', cost: 18900 },
  { key: 'pack',     name: 'Kit de embalaje',     desc: 'Cajas, cinta y film stretch para 10 m³.', cost: 6500 },
  { key: 'lock',     name: 'Candado certificado', desc: 'De acero, anti-corte. Lo dejás vos.',     cost: 4200 },
  { key: 'insure',   name: 'Seguro extendido',    desc: 'Cobertura hasta $2.000.000 por daños.',   cost: 3900 },
];

/* ════════════════════════════════════════════════════════════════ */
/* Store — localStorage data layer                                    */
/* ════════════════════════════════════════════════════════════════ */
const store = {
  getUser() {
    try { return JSON.parse(localStorage.getItem('mc.user') || 'null'); }
    catch { return null; }
  },
  setUser(user) {
    if (user) localStorage.setItem('mc.user', JSON.stringify(user));
    else localStorage.removeItem('mc.user');
    window.dispatchEvent(new Event('mc:user-change'));
  },
  getReservations() {
    try { return JSON.parse(localStorage.getItem('mc.reservations') || '[]'); }
    catch { return []; }
  },
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
};

function generateCode() {
  const part = () => Math.random().toString(36).slice(2, 6).toUpperCase();
  return `MC-${part()}-${part()}`;
}

/* ════════════════════════════════════════════════════════════════ */
/* Hash routing                                                       */
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

function navigate(hash) {
  window.location.hash = hash;
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

/* ════════════════════════════════════════════════════════════════ */
/* Reveal hook                                                        */
/* ════════════════════════════════════════════════════════════════ */
function useReveal(deps = []) {
  useEffect(() => {
    const els = document.querySelectorAll('[data-reveal]');
    if (!('IntersectionObserver' in window)) {
      els.forEach((el) => el.classList.add('in'));
      return;
    }
    const io = new IntersectionObserver(
      (entries) => entries.forEach((e) => { if (e.isIntersecting) { e.target.classList.add('in'); io.unobserve(e.target); } }),
      { threshold: 0.18, rootMargin: '0px 0px -40px 0px' }
    );
    els.forEach((el) => io.observe(el));
    return () => io.disconnect();
  }, deps);
}

/* ════════════════════════════════════════════════════════════════ */
/* Isologo (brand mark — 2 squares + lock)                            */
/* ════════════════════════════════════════════════════════════════ */
function Isologo({ size = 36 }) {
  return (
    <svg viewBox="0 0 40 40" width={size} height={size} aria-hidden="true">
      {/* Two squares intersecting */}
      <rect x="3"  y="3"  width="24" height="24" rx="1" fill="none" stroke="#3D3083" strokeWidth="2.4" />
      <rect x="13" y="13" width="24" height="24" rx="1" fill="none" stroke="#0a0a0a" strokeWidth="2.4" />
      {/* Center square (intersection) — green with lock */}
      <rect x="13" y="13" width="14" height="14" fill="#5ECA00" />
      <path d="M17.5 19v-1.2a2.5 2.5 0 015 0V19" stroke="#0a0a0a" strokeWidth="1.6" fill="none" strokeLinecap="round" />
      <rect x="16.5" y="19" width="7" height="5" rx="0.6" fill="#0a0a0a" />
    </svg>
  );
}

/* ════════════════════════════════════════════════════════════════ */
/* NAV                                                                */
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
      navigate('#/');
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
          <a onClick={() => goSection('sizes')}>Espacios</a>
          <a onClick={() => goSection('how')}>Cómo funciona</a>
          <a onClick={() => goSection('faq')}>Preguntas</a>
        </nav>

        <div className="mc-nav-right">
          <a className="mc-nav-phone" href="tel:+541143016001">{PHONE}</a>
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
          <button
            className={`mc-burger ${open ? 'open' : ''}`}
            onClick={() => setOpen(!open)}
            aria-label={open ? 'Cerrar menú' : 'Abrir menú'}
            aria-expanded={open}
          ><span /><span /><span /></button>
        </div>
      </div>
    </header>
  );
}

/* ════════════════════════════════════════════════════════════════ */
/* HOME — sections                                                    */
/* ════════════════════════════════════════════════════════════════ */
function Hero({ onReserve }) {
  return (
    <section className="mc-hero mc-container" id="top">
      <div className="mc-hero-meta" data-reveal>
        <span className="pill"><span className="dot" />Self-storage · Buenos Aires</span>
        <span>Desde 2019 · +2.300 clientes</span>
      </div>

      <h1 className="mc-hero-title">
        <span className="line"><span className="reveal">Tu espacio,</span></span>
        <span className="line">
          <span className="reveal">
            <span className="img-inline" aria-hidden="true"><img src="assets/hero-box.webp" alt="" /></span>{' '}
            <span className="v">cuando lo</span>
          </span>
        </span>
        <span className="line"><span className="reveal"><span className="g">necesites</span>.</span></span>
      </h1>

      <div className="mc-hero-grid" data-reveal>
        <p className="mc-hero-lead">
          Reservá, accedé y gestioná todo desde la web — sin papeleo, sin llamados,
          sin esperar. Self-storage flexible mes a mes.
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
          <span className="micro">5 min · sin depósito · cancelás cuando quieras</span>
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
          <b>5'</b>
          <div className="sub">Eso tarda reservar online. Sin papeleo, sin firma.</div>
        </div>
      </div>
    </section>
  );
}

function Ticker() {
  const items = ['Sin depósito', 'Sin anticipo', 'Sin permanencia', 'Seguridad 24/7', 'Acceso 24/7', 'Gestión online', 'Coworking incluido'];
  const run = [...items, ...items, ...items];
  return (
    <div className="mc-ticker" aria-hidden="true">
      <div className="mc-ticker-track">
        {run.map((it, i) => (<span key={i} className="mc-ticker-item"><span className="dot" /> {it}</span>))}
      </div>
    </div>
  );
}

function Sizes({ onReserveSize }) {
  return (
    <section className="mc-sizes mc-container" id="sizes">
      <div className="mc-sec-head" data-reveal>
        <span className="mc-eyebrow green">Nuestros espacios</span>
        <h2>Cuatro tamaños,<br /><span className="g">precios claros</span>.</h2>
        <p>Pagás mes a mes. Cambiás de tamaño cuando quieras, sin penalidades ni tarifas ocultas.</p>
      </div>

      <div className="mc-sizes-list" data-reveal>
        {SIZES.map((s, i) => (
          <article
            key={s.key}
            className="mc-size-row"
            role="button"
            tabIndex={0}
            onClick={() => onReserveSize(s)}
            onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onReserveSize(s); } }}
          >
            <div className="mc-size-num">0{i + 1} ──</div>
            <div className="mc-size-name">
              <h3>{s.label}</h3>
              <span>{s.range}</span>
            </div>
            <div className="mc-size-blurb">
              <p>{s.blurb}</p>
              <div className="mc-size-fits">{s.fits.map((f, j) => <span key={j}>{f}</span>)}</div>
            </div>
            <div className="mc-size-price">
              <span className="from">Desde</span>
              <b>${s.from.toLocaleString('es-AR')}</b>
              <span className="unit">por mes</span>
            </div>
            <div className="mc-size-go" aria-hidden="true">→</div>
          </article>
        ))}
      </div>
    </section>
  );
}

function How() {
  const steps = [
    { n: '01', t: 'Elegí tu tamaño',   d: 'Cuatro opciones transparentes, mes a mes.' },
    { n: '02', t: 'Reservá online',    d: 'Cinco minutos. Sin depósito ni anticipo.' },
    { n: '03', t: 'Gestioná desde tu cuenta', d: 'Pagos, accesos, facturación — todo en el portal cliente.' },
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
          <p>Arrancás con el primer mes y ya. Cancelás con 7 días de aviso, sin penalidades ni cargos ocultos. Pagás solo el tiempo que usás.</p>
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
            <li>Elegís tamaño, fecha de inicio y add-ons</li>
            <li>Pagás online con tarjeta o transferencia</li>
            <li>Recibís tu código de acceso al instante</li>
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
            <li>Ver y descargar tus facturas</li>
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
          <blockquote>
            Lo contraté un miércoles y el jueves ya había mudado medio depósito. Cero vueltas, cero letra chica. Es lo más cercano a "mudarte sin mudarte" que probé.
          </blockquote>
          <figcaption>
            <span className="avatar">JM</span>
            <div><b>Julia M.</b><span>Fundadora · Tienda online</span></div>
          </figcaption>
        </figure>

        <div className="mc-testi-side">
          <figure data-reveal="2">
            <div className="stars" aria-label="5 estrellas">★★★★★</div>
            <blockquote>El portal me ahorra llamados. Pago, accedo y veo facturas desde la web.</blockquote>
            <figcaption>
              <span className="avatar">TR</span>
              <div><b>Tomás R.</b><span>PyME · Importación</span></div>
            </figcaption>
          </figure>

          <figure data-reveal="3">
            <div className="stars" aria-label="5 estrellas">★★★★★</div>
            <blockquote>Siempre impecable y el personal es buena onda. Lo uso hace dos años.</blockquote>
            <figcaption>
              <span className="avatar">CP</span>
              <div><b>Carla P.</b><span>Particular</span></div>
            </figcaption>
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
    { q: '¿Cómo accedo al box?',                 a: 'Con un QR personal generado desde tu cuenta. Lo abrís en el celular, lo escaneás en el ingreso y entrás. Funciona 24/7.' },
    { q: '¿Puedo cambiar de tamaño después?',    a: 'Sí. Desde el portal cambiás de tamaño sin penalidad. Si crece tu necesidad o si querés achicar, lo hacés con un click.' },
    { q: '¿Retiran mis cosas de mi casa?',       a: 'Sí. Ofrecemos retiro opcional dentro de CABA y GBA. Lo agregás como add-on al hacer la reserva online.' },
    { q: '¿Qué incluye el coworking?',           a: 'Escritorio, wifi y sala de reuniones reservable — sin cargo extra mientras alquilás un espacio.' },
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
                <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M6 9l6 6 6-6" />
                </svg>
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
        <h2>
          <span>Empezá hoy.</span>
          <span>Guardá mañana.</span>
        </h2>
        <div className="mc-bigcta-actions">
          <button className="mc-btn mc-btn-green big" onClick={onReserve}>
            <span>Elegí tu espacio</span>
            <span className="arrow">→</span>
          </button>
          <div className="mc-bigcta-phone">
            <small>o llamanos</small>
            <b><a href="tel:+541143016001" style={{ color: 'inherit' }}>{PHONE}</a></b>
          </div>
        </div>
        <div className="mc-bigcta-foot">
          <span>MiContainer · BsAs · 2026</span>
          <span>Hecho en Buenos Aires</span>
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
          <p>Self-storage flexible en Buenos Aires. Reservá y gestioná todo online.</p>
          <button className="mc-btn mc-btn-primary" onClick={onReserve}>
            <span>Reservá tu espacio</span>
            <span className="arrow">→</span>
          </button>
        </div>
        <div className="mc-footer-cols">
          <div>
            <h5>Producto</h5>
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
            <a href="tel:+541143016001">{PHONE}</a>
            <a href="mailto:info@micontainer.com">info@micontainer.com</a>
          </div>
        </div>
      </div>
      <div className="mc-footer-base">
        <span>© 2026 Mi Container</span>
        <span>Hecho en Buenos Aires</span>
      </div>
    </footer>
  );
}

/* ════════════════════════════════════════════════════════════════ */
/* RESERVATION WIZARD                                                 */
/* ════════════════════════════════════════════════════════════════ */
function Wizard({ initialSize, user, onClose, onComplete }) {
  const [step, setStep] = useState(0);
  const [data, setData] = useState({
    size: initialSize || SIZES[0],
    startDate: '',
    duration: 3, // months
    addons: [],
    name: user?.name || '',
    email: user?.email || '',
    phone: user?.phone || '',
    dni: user?.dni || '',
    payment: 'card',
  });
  const [errors, setErrors] = useState({});

  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape' && step < 4) onClose(); };
    document.addEventListener('keydown', onKey);
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = '';
    };
  }, [step, onClose]);

  const today = useMemo(() => {
    const d = new Date(); d.setDate(d.getDate() + 1);
    return d.toISOString().split('T')[0];
  }, []);
  useEffect(() => {
    if (!data.startDate) setData((d) => ({ ...d, startDate: today }));
  }, [today]);

  const addonTotal = data.addons.reduce((sum, k) => sum + (ADDONS.find((a) => a.key === k)?.cost || 0), 0);
  const monthly = data.size.from;
  const setupFee = data.addons.includes('pickup') ? ADDONS.find((a) => a.key === 'pickup').cost : 0;
  const oneOffAddons = data.addons.filter((k) => k !== 'pickup').reduce((sum, k) => sum + ADDONS.find((a) => a.key === k).cost, 0);
  const firstMonth = monthly + setupFee + oneOffAddons;

  const toggleAddon = (k) => setData((d) => ({
    ...d,
    addons: d.addons.includes(k) ? d.addons.filter((x) => x !== k) : [...d.addons, k],
  }));

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
    if (step === 2) { setStep(3); return; }
    if (step === 3) {
      if (!validateData()) return;
      // Save user + reservation
      const user = {
        name: data.name.trim(),
        email: data.email.trim().toLowerCase(),
        phone: data.phone,
        dni: data.dni,
      };
      store.setUser(user);
      const code = generateCode();
      const reservation = {
        id: code,
        userEmail: user.email,
        status: 'active',
        size: data.size,
        startDate: data.startDate,
        duration: data.duration,
        addons: data.addons,
        monthly,
        firstMonth,
        createdAt: new Date().toISOString(),
      };
      store.addReservation(reservation);
      setStep(4);
      onComplete && onComplete(reservation);
      return;
    }
    setStep(step + 1);
  };

  const back = () => setStep(Math.max(0, step - 1));

  const totalSteps = 4;
  const progress = step >= 4 ? 100 : Math.round(((step + 1) / totalSteps) * 100);

  return (
    <div className="mc-wiz-back" onClick={step < 4 ? onClose : undefined} role="dialog" aria-modal="true" aria-labelledby="wiz-title">
      <div className="mc-wiz" onClick={(e) => e.stopPropagation()}>
        {step < 4 && (
          <>
            <div className="mc-wiz-head">
              <div className="step-info">Paso <b>{step + 1}</b> de <b>{totalSteps}</b> · Reservar online</div>
              <button className="close" onClick={onClose} aria-label="Cerrar">
                <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M6 6l12 12M18 6L6 18" /></svg>
              </button>
            </div>
            <div className="mc-wiz-progress"><div className="bar" style={{ width: `${progress}%` }} /></div>
          </>
        )}

        <div className="mc-wiz-body">
          {step === 0 && (
            <>
              <h2 id="wiz-title">¿Qué tamaño necesitás?</h2>
              <p className="lead">Elegí el espacio. Después podés cambiarlo cuando quieras desde el portal.</p>
              <div className="mc-wiz-options">
                {SIZES.map((s) => (
                  <button
                    key={s.key}
                    type="button"
                    className={`mc-wiz-option ${data.size.key === s.key ? 'selected' : ''}`}
                    onClick={() => setData({ ...data, size: s })}
                  >
                    <span className="name">{s.label}</span>
                    <span className="range">{s.range}</span>
                    <span className="desc">{s.blurb}</span>
                    <span className="price">${s.from.toLocaleString('es-AR')} <small>/ mes</small></span>
                  </button>
                ))}
              </div>
            </>
          )}

          {step === 1 && (
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
                    <option value={12}>1 año</option>
                    <option value={24}>2 años o más</option>
                  </select>
                  <span className="hint">Es solo una estimación. Cancelás cuando quieras.</span>
                </div>
              </div>
            </>
          )}

          {step === 2 && (
            <>
              <h2 id="wiz-title">¿Sumás algo más?</h2>
              <p className="lead">Servicios opcionales. Todos los puede agregar más tarde desde el portal.</p>
              {ADDONS.map((a) => (
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
                  <span className="body"><b>{a.name}</b><span>{a.desc}</span></span>
                  <span className="cost">+${a.cost.toLocaleString('es-AR')}</span>
                </button>
              ))}
            </>
          )}

          {step === 3 && (
            <>
              <h2 id="wiz-title">Tus datos</h2>
              <p className="lead">Te creamos la cuenta para que después gestiones todo desde el portal.</p>

              <div className="mc-wiz-summary">
                <h4>Resumen</h4>
                <div className="row"><span>Tamaño</span><b>{data.size.label} · {data.size.range}</b></div>
                <div className="row"><span>Inicio</span><b>{data.startDate || '—'}</b></div>
                <div className="row"><span>Mensualidad</span><b>${monthly.toLocaleString('es-AR')}</b></div>
                {data.addons.length > 0 && <div className="row"><span>Add-ons</span><b>+${addonTotal.toLocaleString('es-AR')}</b></div>}
                <div className="total">
                  <span>Primer pago</span><b>${firstMonth.toLocaleString('es-AR')}</b>
                </div>
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
              <div className="mc-wiz-field">
                <label htmlFor="w-pay">Forma de pago</label>
                <select id="w-pay" value={data.payment} onChange={(e) => setData({ ...data, payment: e.target.value })}>
                  <option value="card">Tarjeta de crédito o débito</option>
                  <option value="transfer">Transferencia bancaria</option>
                  <option value="mp">Mercado Pago</option>
                </select>
                <span className="hint">Al confirmar te redirigimos al checkout seguro.</span>
              </div>
            </>
          )}

          {step === 4 && (
            <div className="mc-wiz-success">
              <div className="badge" aria-hidden="true">
                <svg viewBox="0 0 24 24" width="32" height="32" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12l5 5L20 7" /></svg>
              </div>
              <h2>¡Reserva confirmada!</h2>
              <p>Te mandamos un email a <b>{data.email}</b> con tu credencial digital y el resumen.</p>
              <div className="code">{store.getReservations()[0]?.id}</div>
              <div className="actions">
                <a className="mc-btn mc-btn-violet" href="#/portal">
                  <span>Ir al portal</span>
                  <span className="arrow">→</span>
                </a>
                <button className="mc-btn mc-btn-ghost" onClick={onClose}>
                  <span>Cerrar</span>
                </button>
              </div>
            </div>
          )}
        </div>

        {step < 4 && (
          <div className="mc-wiz-foot">
            {step > 0 ? (
              <button className="mc-btn mc-btn-ghost" onClick={back}><span>← Atrás</span></button>
            ) : <span />}
            <button className="mc-btn mc-btn-green" onClick={next}>
              <span>{step === 3 ? 'Confirmar reserva' : 'Continuar'}</span>
              <span className="arrow">→</span>
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

/* ════════════════════════════════════════════════════════════════ */
/* PORTAL                                                             */
/* ════════════════════════════════════════════════════════════════ */
function PortalLogin({ onLogin }) {
  const [email, setEmail] = useState('');
  const [err, setErr] = useState('');

  const submit = (e) => {
    e.preventDefault();
    if (!/^\S+@\S+\.\S+$/.test(email)) { setErr('Ingresá un email válido'); return; }
    // Mock: any email logs in. If existing user, use their data.
    const existing = store.getUser();
    if (existing && existing.email === email.toLowerCase()) {
      onLogin(existing);
    } else {
      const user = { email: email.toLowerCase(), name: email.split('@')[0] };
      store.setUser(user);
      onLogin(user);
    }
  };

  return (
    <div className="mc-login">
      <div className="mc-login-card">
        <span className="mc-eyebrow violet">Portal cliente</span>
        <h2>Entrá a <span className="v">tu cuenta</span>.</h2>
        <p>Te enviamos un link mágico al email. Sin contraseñas.</p>
        <form onSubmit={submit}>
          <div className="mc-wiz-field">
            <label htmlFor="login-email">Email</label>
            <input
              id="login-email"
              type="email"
              value={email}
              onChange={(e) => { setEmail(e.target.value); setErr(''); }}
              placeholder="vos@email.com"
              autoFocus
            />
            {err && <span className="err">{err}</span>}
          </div>
          <button type="submit" className="mc-btn mc-btn-violet full big">
            <span>Continuar</span>
            <span className="arrow">→</span>
          </button>
        </form>
        <a className="mc-login-back" href="#/">← Volver al inicio</a>
      </div>
    </div>
  );
}

function PortalDashboard({ user, reservations, onLogout, onReserve }) {
  const activeCount = reservations.filter((r) => r.status === 'active').length;
  const totalMonthly = reservations.filter((r) => r.status === 'active').reduce((sum, r) => sum + r.monthly, 0);

  return (
    <>
      <section className="mc-portal-hero">
        <div className="mc-portal-hero-inner">
          <span className="mc-eyebrow on-dark">Portal cliente</span>
          <h1>Hola, <span className="g">{user.name || user.email.split('@')[0]}</span>.</h1>
          <p>Acá vas a ver tus reservas activas, facturas, accesos y todo lo que necesites gestionar.</p>
        </div>
      </section>

      <div className="mc-portal">
        <div className="mc-portal-grid">
          <div className="mc-portal-card">
            <h3>Tus reservas <span className="lbl">{reservations.length} total</span></h3>
            {reservations.length === 0 ? (
              <div className="mc-portal-empty">
                <b>Todavía no tenés reservas</b>
                <p>Reservá tu primer espacio en menos de 5 minutos.</p>
                <button className="mc-btn mc-btn-green" onClick={onReserve}>
                  <span>Reservar ahora</span>
                  <span className="arrow">→</span>
                </button>
              </div>
            ) : (
              <div className="mc-res-list">
                {reservations.map((r, i) => (
                  <a key={r.id} className="mc-res-card" href={`#/portal/r/${r.id}`}>
                    <span className="num">0{i + 1}</span>
                    <div className="info">
                      <b>Espacio {r.size.label} · {r.size.range}</b>
                      <span>Inicio: {r.startDate} · {r.id}</span>
                      <span className={`badge ${r.status === 'active' ? 'active' : 'pending'}`}>{r.status === 'active' ? 'Activa' : 'Pendiente'}</span>
                    </div>
                    <div className="price">
                      ${r.monthly.toLocaleString('es-AR')}
                      <small>por mes</small>
                    </div>
                  </a>
                ))}
              </div>
            )}
          </div>

          <div className="mc-portal-card">
            <h3>Resumen <span className="lbl">Tu cuenta</span></h3>
            <div className="mc-portal-stats">
              <div className="stat">
                <span className="lbl">Reservas activas</span>
                <b>{activeCount}</b>
                <span className="sub">{activeCount === 1 ? 'espacio en uso' : 'espacios en uso'}</span>
              </div>
              <div className="stat">
                <span className="lbl">Mensual total</span>
                <b>${totalMonthly.toLocaleString('es-AR')}</b>
                <span className="sub">Próximo cobro el día 1</span>
              </div>
              <div className="stat">
                <span className="lbl">Email</span>
                <b style={{ fontSize: '15px' }}>{user.email}</b>
              </div>
            </div>
            <div style={{ marginTop: 18, display: 'flex', gap: 10, flexWrap: 'wrap' }}>
              <button className="mc-btn mc-btn-green" onClick={onReserve}><span>Nueva reserva</span><span className="arrow">→</span></button>
              <button className="mc-btn mc-btn-ghost" onClick={onLogout}><span>Salir</span></button>
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

  const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?data=${encodeURIComponent(reservation.id + '|' + user.email)}&size=200x200&bgcolor=f7f4ec&color=3D3083&margin=0`;
  const addonNames = reservation.addons.map((k) => ADDONS.find((a) => a.key === k)?.name).filter(Boolean);

  const cancel = () => {
    if (!confirm('¿Cancelar esta reserva? Va a quedar marcada como cancelada con efecto en 7 días.')) return;
    onUpdate(reservation.id, { status: 'cancelled' });
  };

  return (
    <>
      <section className="mc-portal-hero">
        <div className="mc-portal-hero-inner">
          <a className="mc-eyebrow on-dark" href="#/portal" style={{ marginBottom: 14 }}>← Tus reservas</a>
          <h1>Espacio <span className="g">{reservation.size.label}</span></h1>
          <p>{reservation.size.blurb}</p>
        </div>
      </section>

      <div className="mc-portal">
        <div className="mc-res-detail">
          <div className="mc-res-detail-head">
            <div>
              <h2>{reservation.size.label} · {reservation.size.range}</h2>
              <div className="code">{reservation.id}</div>
            </div>
            <span className={`mc-res-card`}>
              <span className={`info`}>
                <span className={`badge ${reservation.status === 'active' ? 'active' : 'pending'}`}>{reservation.status === 'active' ? 'Activa' : reservation.status}</span>
              </span>
            </span>
          </div>

          <div className="mc-res-detail-grid">
            <div className="col">
              <h4>Detalles</h4>
              <p>
                <b>Inicio:</b> {reservation.startDate}<br />
                <b>Duración estimada:</b> {reservation.duration} {reservation.duration === 1 ? 'mes' : 'meses'}<br />
                <b>Mensualidad:</b> ${reservation.monthly.toLocaleString('es-AR')}<br />
                {addonNames.length > 0 && <><b>Add-ons:</b> {addonNames.join(', ')}<br /></>}
                <b>Primer pago:</b> ${reservation.firstMonth.toLocaleString('es-AR')}<br />
                <b>Creada:</b> {new Date(reservation.createdAt).toLocaleDateString('es-AR')}
              </p>
            </div>

            <div className="col">
              <h4>Credencial de acceso</h4>
              <div className="mc-res-qr">
                <img src={qrUrl} alt="Código QR de acceso" width="200" height="200" />
                <div className="lbl">Mostrá este QR al ingresar</div>
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
/* APP                                                                */
/* ════════════════════════════════════════════════════════════════ */
function App() {
  const route = useHashRoute();
  const [user, setUser] = useState(store.getUser());
  const [reservations, setReservations] = useState(store.getReservations());
  const [wizardOpen, setWizardOpen] = useState(false);
  const [wizardSize, setWizardSize] = useState(null);

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
      setWizardSize(null);
      window.location.hash = '#/';
      return;
    }
    // Close wizard when navigating to any non-home route
    if (route.name !== 'home') setWizardOpen(false);
  }, [route]);

  useReveal([route.name]);

  const openWizard = (size = null) => { setWizardSize(size); setWizardOpen(true); };
  const closeWizard = () => setWizardOpen(false);

  const isPortal = route.name === 'portal' || route.name === 'reservation';
  const showHomeChrome = !isPortal;
  const userReservations = user ? reservations.filter((r) => r.userEmail === user.email) : [];

  return (
    <>
      <Nav onReserve={() => openWizard()} route={route} user={user} />

      {route.name === 'home' && (
        <main id="main">
          <Hero onReserve={() => openWizard()} />
          <Ticker />
          <Sizes onReserveSize={(s) => openWizard(s)} />
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
            : <PortalLogin onLogin={() => {}} />
          }
        </main>
      )}

      {route.name === 'reservation' && (
        <main id="main" className="mc-portal-bg">
          {user
            ? <ReservationDetail reservation={userReservations.find((r) => r.id === route.params.id)} user={user} onUpdate={store.updateReservation} />
            : <PortalLogin onLogin={() => {}} />
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
          <div className="lbl">Desde $13.500/mes<span>5 min · sin depósito</span></div>
          <button className="mc-btn mc-btn-green" onClick={() => openWizard()}>
            <span>Reservar</span>
            <span className="arrow">→</span>
          </button>
        </div>
      )}

      {wizardOpen && <Wizard initialSize={wizardSize} user={user} onClose={closeWizard} />}
    </>
  );
}

window.App = App;
ReactDOM.createRoot(document.getElementById('root')).render(<App />);
