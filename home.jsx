// Mi Container v2 — editorial, modern, no calculator.
// New layout: marquee + big title hero · price-forward size grid · split-image use cases ·
// stat ticker · guarantees strip · testimonials · bold CTA · minimal footer.

const { useState, useEffect, useMemo, useRef } = React;

const SIZES = [
  { key: 'chico', label: 'Pequeño', range: '1–3 m²', from: 13500, blurb: 'Cajas, bicis, archivo personal.', fits: ['~20 cajas', '2 bicis', 'Objetos estacionales'] },
  { key: 'mediano', label: 'Mediano', range: '3–9 m²', from: 24900, blurb: 'Un monoambiente o estudio.', fits: ['Monoambiente completo', 'Electrodomésticos', 'Muebles de un cuarto'] },
  { key: 'grande', label: 'Grande', range: '9–15 m²', from: 42000, blurb: 'Casa de 2 ambientes o stock PyME.', fits: ['Casa 2 ambientes', 'Stock e-commerce', '3–5 pallets'] },
  { key: 'xl', label: 'XL', range: '15+ m²', from: 68000, blurb: 'Mudanzas completas, logística.', fits: ['Casa familiar', 'Operación logística', 'Cotización a medida'] },
];

function Nav({ onNav }) {
  const [scrolled, setScrolled] = useState(false);
  useEffect(() => {
    const root = document.querySelector('.frame-scroll:has(.mc-root)') ||
                 document.querySelectorAll('.frame-scroll')[0];
    // fallback: listen on window scroll too
    const onScroll = (e) => {
      const target = e.target === document ? window : e.target;
      const y = target.scrollTop || window.scrollY || 0;
      setScrolled(y > 40);
    };
    document.addEventListener('scroll', onScroll, true);
    return () => document.removeEventListener('scroll', onScroll, true);
  }, []);
  const [open, setOpen] = useState(false);
  return (
    <header className={`mc-nav ${scrolled ? 'is-scrolled' : ''}`}>
      <div className="mc-nav-inner">
        <a className="mc-logo" onClick={() => onNav('top')}>
          <span className="mc-logo-mark">
            <svg viewBox="0 0 32 32" width="28" height="28" fill="none">
              <rect x="3" y="8" width="26" height="18" rx="2" stroke="currentColor" strokeWidth="2.2"/>
              <path d="M3 14h26M11 8v18M21 8v18" stroke="currentColor" strokeWidth="2.2"/>
            </svg>
          </span>
          <span className="mc-logo-type">mi<b>container</b></span>
        </a>
        <nav className={`mc-links ${open ? 'open' : ''}`}>
          <a onClick={() => { onNav('sizes'); setOpen(false); }}>Espacios</a>
          <a onClick={() => { onNav('how'); setOpen(false); }}>Cómo funciona</a>
          <a onClick={() => { onNav('faq'); setOpen(false); }}>Preguntas</a>
        </nav>
        <div className="mc-nav-right">
          <a className="mc-nav-phone">(011) 4301-6001</a>
          <button className="mc-nav-cta" onClick={() => onNav('sizes')}>
            Reservar <span>→</span>
          </button>
          <button className="mc-burger" onClick={() => setOpen(!open)} aria-label="Menu">
            <span /><span /><span />
          </button>
        </div>
      </div>
    </header>
  );
}

function Marquee() {
  const items = ['Sin depósito', 'Sin anticipo', 'Sin permanencia mínima', 'Seguridad 24/7', 'Acceso 24/7', 'Coworking incluido'];
  const run = [...items, ...items, ...items];
  return (
    <div className="mc-marquee">
      <div className="mc-marquee-track">
        {run.map((it, i) => (
          <span key={i} className="mc-marquee-item">
            <em>✦</em> {it}
          </span>
        ))}
      </div>
    </div>
  );
}

function Hero({ onNav }) {
  return (
    <section className="mc-hero" id="top">
      <div className="mc-hero-eyebrow">
        <span className="dot" />
        Self-storage · Buenos Aires · Desde 2019
      </div>

      <h1 className="mc-hero-title">
        <span className="line">Espacio</span>
        <span className="line line-sub">
          <span className="mc-hero-pill">
            <img src="assets/hero-box.webp" alt="" />
          </span>
          <i>para lo que</i>
        </span>
        <span className="line">
          <u>todavía</u> importa.
        </span>
      </h1>

      <div className="mc-hero-meta">
        <p className="mc-hero-lead">
          Guardá tus cosas sin contratos largos ni letra chica.
          Cuatro tamaños, precio claro, acceso cuando quieras.
        </p>
        <div className="mc-hero-actions">
          <button className="mc-btn mc-btn-primary" onClick={() => onNav('sizes')}>
            Reservá tu espacio <span>→</span>
          </button>
          <a className="mc-btn-link" onClick={() => onNav('how')}>
            ¿Cómo funciona? <span>↓</span>
          </a>
        </div>
      </div>

      <div className="mc-hero-stats">
        <div>
          <b>4.9</b>
          <div className="stars">★★★★★</div>
          <span>+2.300 clientes</span>
        </div>
        <div>
          <b>24/7</b>
          <span>acceso todos los días</span>
        </div>
        <div>
          <b>5 min</b>
          <span>para reservar online</span>
        </div>
      </div>
    </section>
  );
}

function Sizes({ onReserve }) {
  const [hover, setHover] = useState(null);
  return (
    <section className="mc-sizes" id="sizes">
      <div className="mc-sec-head">
        <span className="mc-eyebrow">Nuestros espacios</span>
        <h2>
          Cuatro tamaños,<br/>
          <em>precios claros</em>.
        </h2>
        <p>Pagás mes a mes. Cambiás de tamaño cuando quieras, sin penalidades ni tarifas ocultas.</p>
      </div>
      <div className="mc-sizes-list">
        {SIZES.map((s, i) => (
          <article
            key={s.key}
            className={`mc-size-row ${hover === i ? 'hover' : ''}`}
            onMouseEnter={() => setHover(i)}
            onMouseLeave={() => setHover(null)}
            onClick={() => onReserve(s)}
          >
            <div className="mc-size-num">0{i + 1}</div>
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
              <span>desde</span>
              <b>${s.from.toLocaleString('es-AR')}</b>
              <span>/mes</span>
            </div>
            <div className="mc-size-go">
              <span className="lbl">Reservar</span>
              <span>→</span>
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}

function How() {
  const steps = [
    { n: '01', t: 'Elegí tu tamaño', d: 'Cuatro opciones. Transparentes, mes a mes.' },
    { n: '02', t: 'Reservá online', d: 'Cinco minutos. Sin depósito, sin anticipo.' },
    { n: '03', t: 'Traé tus cosas', d: 'Vos o nosotros. Acceso 24/7 desde el día uno.' },
  ];
  return (
    <section className="mc-how" id="how">
      <div className="mc-how-grid">
        <div className="mc-how-intro">
          <span className="mc-eyebrow light">Cómo funciona</span>
          <h2>
            Sin vueltas.<br/>
            <em>Literalmente.</em>
          </h2>
          <p>
            Diseñamos Mi Container para la gente que ya sabe lo que necesita y no quiere perder tiempo en papeleo.
          </p>
        </div>
        <div className="mc-how-steps">
          {steps.map((s, i) => (
            <div key={i} className="mc-how-step">
              <div className="n">{s.n}</div>
              <div className="body">
                <h3>{s.t}</h3>
                <p>{s.d}</p>
              </div>
              <div className="arrow">→</div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function Guarantees() {
  const items = [
    { t: 'Sin depósito', d: 'Nada de adelantar dos meses. Arrancás con el primer mes y ya.' },
    { t: 'Sin permanencia', d: 'Te quedás el tiempo que necesites. Cancelás con 7 días de aviso.' },
    { t: 'Seguridad 24/7', d: 'Vigilancia activa, cámaras y control biométrico en cada acceso.' },
    { t: 'Coworking free', d: 'Escritorio y sala de reuniones sin costo mientras alquilás.' },
  ];
  return (
    <section className="mc-guard">
      <div className="mc-guard-head">
        <span className="mc-eyebrow">Lo que te prometemos</span>
        <h2>
          <em>Cuatro cosas</em><br/>
          que nunca van a cambiar.
        </h2>
      </div>
      <div className="mc-guard-grid">
        {items.map((it, i) => (
          <div key={i} className="mc-guard-item">
            <div className="mc-guard-n">0{i + 1}</div>
            <h3>{it.t}</h3>
            <p>{it.d}</p>
          </div>
        ))}
      </div>
    </section>
  );
}

function Testimonials() {
  const t = [
    { q: 'Lo contraté un miércoles y el jueves ya había mudado medio depósito. Cero vueltas.', name: 'Julia M.', role: 'Fundadora · Tienda online' },
    { q: 'El coworking me salva. Puedo recibir clientes sin pagar una oficina aparte.', name: 'Tomás R.', role: 'PyME · Importación' },
    { q: 'Siempre que voy está impecable y el personal es buena onda. Lo uso hace 2 años.', name: 'Carla P.', role: 'Particular' },
  ];
  return (
    <section className="mc-testi">
      <div className="mc-testi-head">
        <span className="mc-eyebrow">Nos eligen</span>
        <h2>Lo que <em>dicen</em> de Mi Container.</h2>
      </div>
      <div className="mc-testi-grid">
        {t.map((it, i) => (
          <figure key={i} className="mc-testi-card">
            <div className="mc-testi-stars">★★★★★</div>
            <blockquote>"{it.q}"</blockquote>
            <figcaption>
              <div className="avatar">{it.name[0]}</div>
              <div>
                <b>{it.name}</b>
                <span>{it.role}</span>
              </div>
            </figcaption>
          </figure>
        ))}
      </div>
    </section>
  );
}

function FAQ() {
  const [open, setOpen] = useState(0);
  const qa = [
    { q: '¿Necesito firmar un contrato largo?', a: 'No. Alquilás mes a mes y cancelás cuando quieras, sin permanencia mínima ni cargos por salida anticipada.' },
    { q: '¿Puedo acceder fuera de horario?', a: 'Sí. Entrás las 24 horas, los 7 días de la semana, con tu credencial personal.' },
    { q: '¿Retiran mis cosas de mi casa?', a: 'Sí. Ofrecemos retiro opcional dentro de CABA y GBA. Cotizamos al momento de reservar.' },
    { q: '¿Qué incluye el coworking?', a: 'Escritorio, wifi y sala de reuniones reservable — sin cargo extra mientras alquilás un espacio.' },
    { q: '¿Qué no puedo guardar?', a: 'Materiales inflamables, tóxicos, alimentos perecederos, seres vivos y productos ilegales. El resto, todo.' },
  ];
  return (
    <section className="mc-faq" id="faq">
      <div className="mc-faq-head">
        <span className="mc-eyebrow">Preguntas frecuentes</span>
        <h2>Dudas que <em>siempre</em><br/> nos hacen.</h2>
        <p>¿Tenés otra? Llamanos o escribinos por WhatsApp.</p>
      </div>
      <div className="mc-faq-list">
        {qa.map((it, i) => (
          <div key={i} className={`mc-faq-item ${open === i ? 'open' : ''}`} onClick={() => setOpen(open === i ? -1 : i)}>
            <div className="q">
              <h3>{it.q}</h3>
              <span className="toggle">{open === i ? '−' : '+'}</span>
            </div>
            <div className="a"><p>{it.a}</p></div>
          </div>
        ))}
      </div>
    </section>
  );
}

function BigCTA({ onNav }) {
  return (
    <section className="mc-bigcta">
      <div className="mc-bigcta-inner">
        <h2>
          <span>Empezá hoy.</span>
          <span>Guardá mañana.</span>
        </h2>
        <div className="mc-bigcta-actions">
          <button className="mc-btn mc-btn-primary big" onClick={() => onNav('sizes')}>
            Elegí tu espacio <span>→</span>
          </button>
          <a className="mc-bigcta-phone">
            <small>o llamanos</small>
            <b>(011) 4301-6001</b>
          </a>
        </div>
      </div>
      <div className="mc-bigcta-sig">MiContainer · BsAs · 2026</div>
    </section>
  );
}

function Footer({ onNav }) {
  return (
    <footer className="mc-footer">
      <div className="mc-footer-top">
        <div className="mc-footer-brand">
          <a className="mc-logo" onClick={() => onNav('top')} style={{ cursor: 'pointer' }}>
            <span className="mc-logo-mark">
              <svg viewBox="0 0 32 32" width="28" height="28" fill="none">
                <rect x="3" y="8" width="26" height="18" rx="2" stroke="currentColor" strokeWidth="2.2"/>
                <path d="M3 14h26M11 8v18M21 8v18" stroke="currentColor" strokeWidth="2.2"/>
              </svg>
            </span>
            <span className="mc-logo-type">mi<b>container</b></span>
          </a>
          <p>Self-storage flexible en Buenos Aires.</p>
          <button className="mc-btn mc-btn-primary mc-footer-cta" onClick={() => onNav('sizes')}>
            Reservá tu espacio <span>→</span>
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
            <a>Términos</a>
          </div>
          <div>
            <h5>Contacto</h5>
            <a href="https://wa.me/5491143016001" target="_blank" rel="noopener">WhatsApp</a>
            <a href="tel:+541143016001">(011) 4301-6001</a>
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

function MiContainerHome({ tweaks, scope }) {
  const rootRef = useRef(null);
  const onNav = (id) => {
    const el = rootRef.current?.querySelector(`#${id}`);
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };
  const onReserve = (s) => {
    alert(`Reserva: ${s.label} (${s.range}) · desde $${s.from.toLocaleString('es-AR')}/mes`);
  };
  return (
    <div className={`mc-root mc-scope-${scope}`} ref={rootRef}
      data-density={tweaks.density}
      data-radius={tweaks.radius}
      data-primary={tweaks.primary}
      data-marquee={tweaks.marquee ? 'on' : 'off'}>
      <Nav onNav={onNav} />
      <Hero onNav={onNav} />
      {tweaks.marquee && <Marquee />}
      <Sizes onReserve={onReserve} />
      <How />
      <Guarantees />
      <Testimonials />
      <FAQ />
      <BigCTA onNav={onNav} />
      <Footer onNav={onNav} />

      <button className="mc-reserve-fab" onClick={() => onNav('sizes')} aria-label="Reservá ahora">
        <span className="pulse" aria-hidden="true"></span>
        <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <rect x="3" y="5" width="18" height="16" rx="2"/>
          <path d="M16 3v4M8 3v4M3 11h18"/>
        </svg>
        <span className="label">Reservá ahora</span>
        <span className="arrow" aria-hidden="true">→</span>
      </button>

      <a className="mc-fab" href="https://wa.me/5491143016001" target="_blank" rel="noopener" aria-label="WhatsApp">
        <svg viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg">
          <path d="M16.004 3C8.82 3 3 8.82 3 16.004c0 2.29.6 4.53 1.74 6.507L3 29l6.63-1.725A12.96 12.96 0 0016.004 29C23.19 29 29 23.19 29 16.004 29 8.82 23.19 3 16.004 3z" fill="#fff"/>
          <path d="M22.78 19.49c-.37-.19-2.2-1.08-2.54-1.2-.34-.13-.59-.19-.84.19s-.96 1.2-1.18 1.45c-.22.25-.43.28-.8.09-.37-.19-1.57-.58-2.99-1.84-1.11-.98-1.85-2.2-2.07-2.57-.22-.37-.02-.57.16-.76.17-.17.37-.43.56-.65.19-.22.25-.37.37-.62.12-.25.06-.46-.03-.65-.09-.19-.84-2.02-1.15-2.77-.3-.73-.61-.63-.84-.64-.22-.01-.46-.01-.71-.01-.25 0-.65.09-.99.46-.34.37-1.3 1.27-1.3 3.1 0 1.83 1.33 3.6 1.51 3.85.19.25 2.61 3.99 6.33 5.6.88.38 1.57.6 2.11.77.88.28 1.69.24 2.33.15.71-.11 2.2-.9 2.51-1.77.31-.87.31-1.61.22-1.77-.09-.16-.34-.25-.71-.43z" fill="#25d366"/>
        </svg>
      </a>
    </div>
  );
}

window.MiContainerHome = MiContainerHome;
