// Mi Container v3 — refactor 2026
// Editorial type · bento guarantees · 1-hero + 2-side testimonials
// · grain · reveal-on-scroll · inline modal · single WA dock

const { useState, useEffect, useMemo, useRef } = React;

const PHONE = '(011) 4301-6001';
const WHATSAPP = 'https://wa.me/5491143016001';

const SIZES = [
  { key: 'chico',   label: 'Pequeño', range: '1–3 m²',  from: 13500, blurb: 'Cajas, bicis, archivo personal.', fits: ['~20 cajas', '2 bicis', 'Objetos estacionales'] },
  { key: 'mediano', label: 'Mediano', range: '3–9 m²',  from: 24900, blurb: 'Un monoambiente o estudio.',     fits: ['Monoambiente', 'Electrodomésticos', 'Muebles de un cuarto'] },
  { key: 'grande',  label: 'Grande',  range: '9–15 m²', from: 42000, blurb: 'Casa de 2 ambientes o stock PyME.', fits: ['Casa 2 ambientes', 'Stock e-commerce', '3–5 pallets'] },
  { key: 'xl',      label: 'XL',      range: '15+ m²',  from: 68000, blurb: 'Mudanzas completas, logística.',  fits: ['Casa familiar', 'Operación logística', 'A medida'] },
];

/* ── Reveal-on-scroll hook ─────────────────────────────────────── */
function useReveal() {
  useEffect(() => {
    const els = document.querySelectorAll('[data-reveal]');
    if (!('IntersectionObserver' in window)) {
      els.forEach((el) => el.classList.add('in'));
      return;
    }
    const io = new IntersectionObserver(
      (entries) => {
        entries.forEach((e) => {
          if (e.isIntersecting) {
            e.target.classList.add('in');
            io.unobserve(e.target);
          }
        });
      },
      { threshold: 0.18, rootMargin: '0px 0px -40px 0px' }
    );
    els.forEach((el) => io.observe(el));
    return () => io.disconnect();
  }, []);
}

/* ── Nav ───────────────────────────────────────────────────────── */
function Nav({ onNav, onReserveTop }) {
  const [scrolled, setScrolled] = useState(false);
  const [open, setOpen] = useState(false);
  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 24);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);
  return (
    <header className={`mc-nav ${scrolled ? 'is-scrolled' : ''}`}>
      <div className="mc-nav-inner">
        <a className="mc-logo" href="#top" aria-label="Mi Container — inicio">
          <span className="mc-logo-mark">
            <svg viewBox="0 0 32 32" width="22" height="22" fill="none" aria-hidden="true">
              <rect x="4" y="9" width="24" height="16" rx="1.5" stroke="currentColor" strokeWidth="2.2"/>
              <path d="M4 14h24M12 9v16M20 9v16" stroke="currentColor" strokeWidth="2.2"/>
            </svg>
          </span>
          <span className="mc-logo-type">mi<b>container</b></span>
        </a>

        <nav className={`mc-links ${open ? 'open' : ''}`} aria-label="Principal">
          <a onClick={() => { onNav('sizes'); setOpen(false); }}>Espacios</a>
          <a onClick={() => { onNav('how');   setOpen(false); }}>Cómo funciona</a>
          <a onClick={() => { onNav('faq');   setOpen(false); }}>Preguntas</a>
        </nav>

        <div className="mc-nav-right">
          <a className="mc-nav-phone" href={`tel:+541143016001`}>{PHONE}</a>
          <button className="mc-btn mc-btn-primary" onClick={onReserveTop}>
            <span>Reservar</span>
            <span className="arrow">→</span>
          </button>
          <button
            className={`mc-burger ${open ? 'open' : ''}`}
            onClick={() => setOpen(!open)}
            aria-label={open ? 'Cerrar menú' : 'Abrir menú'}
            aria-expanded={open}
          >
            <span /><span /><span />
          </button>
        </div>
      </div>
    </header>
  );
}

/* ── Hero ──────────────────────────────────────────────────────── */
function Hero({ onNav, onReserveTop }) {
  return (
    <section className="mc-hero mc-container" id="top">
      <div className="mc-hero-meta" data-reveal>
        <span className="pill"><span className="dot" />Self-storage · Buenos Aires</span>
        <span>Desde 2019 · +2.300 clientes</span>
      </div>

      <h1 className="mc-hero-title">
        <span className="line"><span className="reveal">Espacio</span></span>
        <span className="line">
          <span className="reveal">
            <span className="img-inline" aria-hidden="true"><img src="assets/hero-box.webp" alt="" /></span>{' '}
            <em>para lo que</em>
          </span>
        </span>
        <span className="line"><span className="reveal">todavía importa.</span></span>
      </h1>

      <div className="mc-hero-grid" data-reveal>
        <p className="mc-hero-lead">
          Guardá tus cosas sin contratos largos ni letra chica.
          Cuatro tamaños, precio claro, acceso cuando quieras.
        </p>
        <div className="mc-hero-actions">
          <div className="row">
            <button className="mc-btn mc-btn-green big" onClick={onReserveTop}>
              <span>Reservá tu espacio</span>
              <span className="arrow">→</span>
            </button>
            <button className="mc-btn mc-btn-ghost" onClick={() => onNav('how')}>
              <span>¿Cómo funciona?</span>
              <span className="arrow">↓</span>
            </button>
          </div>
          <span className="micro">Sin depósito · Cancelás cuando quieras</span>
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

/* ── Ticker ────────────────────────────────────────────────────── */
function Ticker() {
  const items = ['Sin depósito', 'Sin anticipo', 'Sin permanencia', 'Seguridad 24/7', 'Acceso 24/7', 'Coworking incluido'];
  const run = [...items, ...items, ...items];
  return (
    <div className="mc-ticker" aria-hidden="true">
      <div className="mc-ticker-track">
        {run.map((it, i) => (
          <span key={i} className="mc-ticker-item">
            <span className="dot" /> {it}
          </span>
        ))}
      </div>
    </div>
  );
}

/* ── Sizes ─────────────────────────────────────────────────────── */
function Sizes({ onReserve }) {
  return (
    <section className="mc-sizes mc-container" id="sizes">
      <div className="mc-sec-head" data-reveal>
        <span className="mc-eyebrow green">Nuestros espacios</span>
        <h2>
          Cuatro tamaños,<br />
          <span className="serif" style={{ color: 'var(--mc-green-deep)' }}>precios claros</span>.
        </h2>
        <p>Pagás mes a mes. Cambiás de tamaño cuando quieras, sin penalidades ni tarifas ocultas.</p>
      </div>

      <div className="mc-sizes-list" data-reveal>
        {SIZES.map((s, i) => (
          <article
            key={s.key}
            className="mc-size-row"
            role="button"
            tabIndex={0}
            onClick={() => onReserve(s)}
            onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onReserve(s); } }}
          >
            <div className="mc-size-num">0{i + 1} ──</div>
            <div className="mc-size-name">
              <h3>{s.label}</h3>
              <span>{s.range}</span>
            </div>
            <div className="mc-size-blurb">
              <p>{s.blurb}</p>
              <div className="mc-size-fits">
                {s.fits.map((f, j) => <span key={j}>{f}</span>)}
              </div>
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

/* ── How ───────────────────────────────────────────────────────── */
function How() {
  const steps = [
    { n: '01', t: 'Elegí tu tamaño',  d: 'Cuatro opciones. Transparentes, mes a mes.' },
    { n: '02', t: 'Reservá online',   d: 'Cinco minutos. Sin depósito, sin anticipo.' },
    { n: '03', t: 'Traé tus cosas',   d: 'Vos o nosotros. Acceso 24/7 desde el día uno.' },
  ];
  return (
    <section className="mc-how" id="how">
      <div className="mc-container">
        <div className="mc-how-grid">
          <div className="mc-how-intro" data-reveal>
            <span className="mc-eyebrow green">Cómo funciona</span>
            <h2>Sin vueltas.<br /><em>Literalmente.</em></h2>
            <p>Diseñamos Mi Container para la gente que ya sabe lo que necesita y no quiere perder tiempo en papeleo.</p>
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

/* ── Guarantees (bento) ────────────────────────────────────────── */
function Guarantees({ onReserveTop }) {
  return (
    <section className="mc-guard mc-container">
      <div className="mc-sec-head" data-reveal>
        <span className="mc-eyebrow green">Lo que te prometemos</span>
        <h2>
          <span className="serif" style={{ color: 'var(--mc-green-deep)' }}>Cuatro cosas</span><br />
          que nunca van a cambiar.
        </h2>
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
          <h3>Sin <em>depósito</em>,<br />sin permanencia.</h3>
          <p>Arrancás con el primer mes y ya. Cancelás con 7 días de aviso, sin penalidades ni cargos ocultos. Pagás solo el tiempo que usás.</p>
        </article>

        <article className="mc-bento-item mc-bento-2" data-reveal="2">
          <span className="n">02 / Acceso</span>
          <h3>Acceso 24/7</h3>
          <p>Entrás cuando quieras, los 365 días del año, con tu credencial personal.</p>
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
          <button className="mc-btn mc-btn-green" onClick={onReserveTop}>
            <span>Reservar ahora</span>
            <span className="arrow">→</span>
          </button>
        </article>
      </div>
    </section>
  );
}

/* ── Testimonials ──────────────────────────────────────────────── */
function Testimonials() {
  return (
    <section className="mc-testi mc-container">
      <div className="mc-sec-head" data-reveal>
        <span className="mc-eyebrow green">Nos eligen</span>
        <h2>Lo que <span className="serif" style={{ color: 'var(--mc-green-deep)' }}>dicen</span> de Mi Container.</h2>
      </div>

      <div className="mc-testi-grid">
        <figure className="mc-testi-main" data-reveal>
          <div className="stars" aria-label="5 estrellas">★★★★★</div>
          <blockquote>
            Lo contraté un miércoles y el jueves ya había mudado medio depósito. Cero vueltas, cero letra chica. Es lo más cercano a “mudarte sin mudarte” que probé.
          </blockquote>
          <figcaption>
            <span className="avatar">JM</span>
            <div>
              <b>Julia M.</b>
              <span>Fundadora · Tienda online</span>
            </div>
          </figcaption>
        </figure>

        <div className="mc-testi-side">
          <figure data-reveal="2">
            <div className="stars" aria-label="5 estrellas">★★★★★</div>
            <blockquote>El coworking me salva. Recibo clientes sin pagar una oficina aparte.</blockquote>
            <figcaption>
              <span className="avatar">TR</span>
              <div>
                <b>Tomás R.</b>
                <span>PyME · Importación</span>
              </div>
            </figcaption>
          </figure>

          <figure data-reveal="3">
            <div className="stars" aria-label="5 estrellas">★★★★★</div>
            <blockquote>Siempre impecable y el personal es buena onda. Lo uso hace dos años.</blockquote>
            <figcaption>
              <span className="avatar">CP</span>
              <div>
                <b>Carla P.</b>
                <span>Particular</span>
              </div>
            </figcaption>
          </figure>
        </div>
      </div>
    </section>
  );
}

/* ── FAQ ───────────────────────────────────────────────────────── */
function FAQ() {
  const [open, setOpen] = useState(0);
  const qa = [
    { q: '¿Necesito firmar un contrato largo?', a: 'No. Alquilás mes a mes y cancelás cuando quieras, sin permanencia mínima ni cargos por salida anticipada.' },
    { q: '¿Puedo acceder fuera de horario?',    a: 'Sí. Entrás las 24 horas, los 7 días de la semana, con tu credencial personal.' },
    { q: '¿Retiran mis cosas de mi casa?',      a: 'Sí. Ofrecemos retiro opcional dentro de CABA y GBA. Cotizamos al momento de reservar.' },
    { q: '¿Qué incluye el coworking?',          a: 'Escritorio, wifi y sala de reuniones reservable — sin cargo extra mientras alquilás un espacio.' },
    { q: '¿Qué no puedo guardar?',              a: 'Materiales inflamables, tóxicos, alimentos perecederos, seres vivos y productos ilegales. El resto, todo.' },
  ];
  return (
    <section className="mc-faq mc-container" id="faq">
      <div className="mc-faq-head" data-reveal>
        <span className="mc-eyebrow green">Preguntas frecuentes</span>
        <h2>Dudas que <em>siempre</em><br /> nos hacen.</h2>
        <p>¿Tenés otra? Llamanos o escribinos por WhatsApp.</p>
      </div>
      <div className="mc-faq-list" data-reveal>
        {qa.map((it, i) => (
          <div key={i} className={`mc-faq-item ${open === i ? 'open' : ''}`}>
            <button
              className="mc-faq-q"
              onClick={() => setOpen(open === i ? -1 : i)}
              aria-expanded={open === i}
            >
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

/* ── Big CTA ───────────────────────────────────────────────────── */
function BigCTA({ onReserveTop }) {
  return (
    <section className="mc-bigcta" data-reveal>
      <div className="mc-bigcta-inner">
        <h2>
          <span>Empezá hoy.</span>
          <span>Guardá mañana.</span>
        </h2>
        <div className="mc-bigcta-actions">
          <button className="mc-btn mc-btn-green big" onClick={onReserveTop}>
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

/* ── Footer ────────────────────────────────────────────────────── */
function Footer({ onNav, onReserveTop }) {
  return (
    <footer className="mc-footer">
      <div className="mc-footer-top">
        <div className="mc-footer-brand">
          <a className="mc-logo" href="#top">
            <span className="mc-logo-mark">
              <svg viewBox="0 0 32 32" width="22" height="22" fill="none" aria-hidden="true">
                <rect x="4" y="9" width="24" height="16" rx="1.5" stroke="currentColor" strokeWidth="2.2"/>
                <path d="M4 14h24M12 9v16M20 9v16" stroke="currentColor" strokeWidth="2.2"/>
              </svg>
            </span>
            <span className="mc-logo-type">mi<b>container</b></span>
          </a>
          <p>Self-storage flexible en Buenos Aires.</p>
          <button className="mc-btn mc-btn-primary" onClick={onReserveTop}>
            <span>Reservá tu espacio</span>
            <span className="arrow">→</span>
          </button>
        </div>
        <div className="mc-footer-cols">
          <div>
            <h5>Producto</h5>
            <a onClick={() => onNav('sizes')}>Espacios y precios</a>
            <a onClick={() => onNav('sizes')}>Empresas</a>
            <a onClick={() => onNav('how')}>Cómo funciona</a>
          </div>
          <div>
            <h5>Compañía</h5>
            <a onClick={() => onNav('faq')}>Preguntas</a>
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

/* ── Modal ─────────────────────────────────────────────────────── */
function ReserveModal({ size, onClose }) {
  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = '';
    };
  }, [onClose]);

  const target = size || SIZES[0];

  return (
    <div className="mc-modal-backdrop" onClick={onClose} role="dialog" aria-modal="true" aria-labelledby="modal-title">
      <div className="mc-modal" onClick={(e) => e.stopPropagation()}>
        <button className="close" onClick={onClose} aria-label="Cerrar">
          <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
            <path d="M6 6l12 12M18 6L6 18" />
          </svg>
        </button>
        <div className="eyebrow">Reservar · {target.range}</div>
        <h3 id="modal-title">Espacio {target.label}</h3>
        <div className="price">
          ${target.from.toLocaleString('es-AR')} <small>/ mes</small>
        </div>
        <p>{target.blurb} Sin depósito, sin permanencia. Te confirmamos disponibilidad en menos de 1 hora hábil.</p>
        <div className="actions">
          <a
            className="mc-btn mc-btn-green big"
            href={`${WHATSAPP}?text=${encodeURIComponent(`Hola, quiero reservar un espacio ${target.label} (${target.range}) — desde $${target.from.toLocaleString('es-AR')}/mes.`)}`}
            target="_blank" rel="noopener"
          >
            <span>Reservar por WhatsApp</span>
            <span className="arrow">→</span>
          </a>
          <a className="mc-btn mc-btn-ghost" href={`tel:+541143016001`}>
            <span>Llamar al {PHONE}</span>
          </a>
          <div className="micro">Respuesta promedio: 18 minutos</div>
        </div>
      </div>
    </div>
  );
}

/* ── Root ──────────────────────────────────────────────────────── */
function MiContainerHome() {
  const [reserveSize, setReserveSize] = useState(null);
  const [showModal, setShowModal] = useState(false);

  useReveal();

  const onNav = (id) => {
    const el = document.getElementById(id);
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };
  const onReserve = (s) => { setReserveSize(s); setShowModal(true); };
  const onReserveTop = () => { setReserveSize(null); setShowModal(true); };

  return (
    <>
      <Nav onNav={onNav} onReserveTop={onReserveTop} />

      <main id="main">
        <Hero onNav={onNav} onReserveTop={onReserveTop} />
        <Ticker />
        <Sizes onReserve={onReserve} />
        <How />
        <Guarantees onReserveTop={onReserveTop} />
        <Testimonials />
        <FAQ />
        <BigCTA onReserveTop={onReserveTop} />
      </main>

      <Footer onNav={onNav} onReserveTop={onReserveTop} />

      <a className="mc-wa" href={WHATSAPP} target="_blank" rel="noopener" aria-label="Escribir por WhatsApp">
        <span className="wa-mark" aria-hidden="true">
          <svg viewBox="0 0 32 32" fill="currentColor" xmlns="http://www.w3.org/2000/svg">
            <path d="M16.004 3C8.82 3 3 8.82 3 16.004c0 2.29.6 4.53 1.74 6.507L3 29l6.63-1.725A12.96 12.96 0 0016.004 29C23.19 29 29 23.19 29 16.004 29 8.82 23.19 3 16.004 3zm6.78 16.49c-.37-.19-2.2-1.08-2.54-1.2-.34-.13-.59-.19-.84.19s-.96 1.2-1.18 1.45c-.22.25-.43.28-.8.09-.37-.19-1.57-.58-2.99-1.84-1.11-.98-1.85-2.2-2.07-2.57-.22-.37-.02-.57.16-.76.17-.17.37-.43.56-.65.19-.22.25-.37.37-.62.12-.25.06-.46-.03-.65-.09-.19-.84-2.02-1.15-2.77-.3-.73-.61-.63-.84-.64-.22-.01-.46-.01-.71-.01-.25 0-.65.09-.99.46-.34.37-1.3 1.27-1.3 3.1 0 1.83 1.33 3.6 1.51 3.85.19.25 2.61 3.99 6.33 5.6.88.38 1.57.6 2.11.77.88.28 1.69.24 2.33.15.71-.11 2.2-.9 2.51-1.77.31-.87.31-1.61.22-1.77z" />
          </svg>
        </span>
        Hablemos
      </a>

      <div className="mc-sticky-bar">
        <div className="lbl">
          Desde $13.500/mes
          <span>Sin depósito · 5 min</span>
        </div>
        <button className="mc-btn mc-btn-green" onClick={onReserveTop}>
          <span>Reservar</span>
          <span className="arrow">→</span>
        </button>
      </div>

      {showModal && <ReserveModal size={reserveSize} onClose={() => setShowModal(false)} />}
    </>
  );
}

window.MiContainerHome = MiContainerHome;

ReactDOM.createRoot(document.getElementById('root')).render(<MiContainerHome />);
