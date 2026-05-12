# Mi Container — Home v3 (Refactor 2026)

Refactor profundo del frontend de Mi Container. Tipografía editorial moderna, bento layout, motion gobernado, grain texture, modal de reserva inline.

**Live preview:** https://augusto-pmd.github.io/Micofrontend/

## Stack

HTML estático + React 18 (via CDN) + Babel standalone (in-browser). Sin build step. GitHub Pages-ready.

## Estructura

```
.
├── index.html    # Entry — fuentes 2026, meta, OG, favicon, grain
├── home.jsx      # React (Hero, Sizes, How, Guarantees, Testi, FAQ, BigCTA, Footer, Modal)
├── styles.css    # Tokens + bento + motion + responsive
└── assets/       # Imágenes
```

## Cambios respecto de v2

### Tipografía
- **Bricolage Grotesque** (variable, `opsz` 12–96) reemplaza Montserrat para display
- **Inter Tight** para body
- **Instrument Serif italic** para énfasis editorial
- **JetBrains Mono** para data/eyebrows
- Tabular-nums global · `text-wrap: balance/pretty`

### Layout
- **Bento grid** asimétrico para garantías (1 hero dark + 3 medianas + 1 CTA inline)
- **1 + 2** para testimonios (hero card + 2 secundarias) en vez de 3 iguales
- **How** sin aurora gradient: paper plano + timeline numerado
- **Big CTA** sobre dark ink con grain + radial verde sutil

### Motion
- `IntersectionObserver` con stagger (`data-reveal`)
- Reveal del hero título línea por línea (clip + translateY)
- Hover springs (`cubic-bezier(0.34, 1.56, 0.64, 1)`)
- `prefers-reduced-motion` respetado

### Surfaces
- Grain texture SVG inline (turbulence + colorMatrix) sobre body + dark CTA
- Colored shadows (verde-tintadas en CTAs)

### UX
- Modal de reserva inline (reemplaza `alert()`) con deep-link a WhatsApp pre-cargado
- Sticky bottom-bar solo mobile
- Un único FAB en desktop (WhatsApp "Hablemos")
- FAQ chevron animado + barra de acento verde lateral

### Accesibilidad
- Skip link · Semantic HTML
- ARIA (`aria-expanded`, `aria-modal`, focus visible)
- Keyboard handlers en rows
- Alt text honesto

## Correr en local

```bash
npx serve@latest .
```

## Paleta

- **Verde primary:** `#5eca00` (deep `#3f8a09`, ink `#1f4504`, mist `#e7f5d0`)
- **Violet accent:** `#4a1cc4`
- **Ink scale:** `#0f0d18` → `#c7c3d2` (warm violet-tinted, sin negro puro)
- **Paper:** `#f7f4ec` (warm cream)
