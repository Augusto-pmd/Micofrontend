# Mi Container — Home (Redesign)

Propuesta de rediseño de la home de Mi Container. Editorial moderna, sin calculadora embebida, con enfoque en simplicidad y conversión.

## Estructura

```
.
├── Mi Container - Home.html   # Entry point (desktop + mobile side-by-side en design canvas)
├── home.jsx                   # Componente principal de la home
├── styles.css                 # Todos los estilos
├── design-canvas.jsx          # Shell del canvas
├── assets/                    # Imágenes del repo original
└── mi-container-home.bundle.html  # Versión autocontenida (single-file, offline)
```

## Secciones

1. **Nav flotante** (pill con glassmorphism)
2. **Hero** — tipografía display grande, stats sociales
3. **Marquee** de beneficios
4. **Espacios** — 4 tamaños con precios claros, row hover verde
5. **Cómo funciona** — 3 pasos, fondo degradé claro verde→lila
6. **Para quién** — tab switcher (Casa / Negocio) con card editorial grande
7. **Lo que te prometemos** — 4 garantías en card blanca
8. **Testimonios** — 3 cards
9. **FAQ** — sticky sidebar + acordeón
10. **Big CTA** final — tipografía gigante, degradé claro
11. **Footer**

## Cómo correr

Es HTML estático. Abrí `Mi Container - Home.html` con un servidor local (live-server, `python -m http.server`, etc.) — no funciona desde `file://` por los imports de Babel.

La versión bundle (`mi-container-home.bundle.html`) sí abre directo con doble click.

## Tweaks

La toolbar de la derecha permite cambiar en vivo:
- **Primary color** (verde / violeta)
- **Density** (compact / comfortable / spacious)
- **Radius** (sharp / rounded / pill)
- **Marquee** (on / off)

## Paleta

- **Verde primario:** `#5eca00` (oscuro `#4ba700`, soft `#e8f7d1`)
- **Violeta accent:** `#430098` (soft `#ede3ff`)
- **Ink:** `#1a1727` (sin negro puro — violet-tinted)
- **Background:** `#f8f6f0` (warm cream)

## Tipografía

- **Display / UI:** Montserrat (400–900)
- **Mono (eyebrows, stats):** JetBrains Mono
