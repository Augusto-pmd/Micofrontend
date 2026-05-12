# Mi Container — v4 (Brand-compliant + autogestión)

Reskin completo respetando el **Manual de Marca · Junio 2022** + sistema **autogestivo end-to-end**: wizard de reserva online + portal cliente con credencial QR.

**Live:** https://augusto-pmd.github.io/Micofrontend/

## Stack

HTML estático + React 18 (CDN) + Babel standalone in-browser. Sin build step. GitHub Pages-ready. Persistencia en `localStorage` (mock hasta integrar backend).

## Estructura

```
.
├── index.html    # Entry — Roboto + meta + isologo SVG inline + grain
├── home.jsx      # App completa: router + home + wizard + portal + store
├── styles.css    # Tokens brand + wizard + portal + responsive
└── assets/       # Imágenes
```

## Cambios respecto de v3

### Brand compliance (Manual de Marca · Junio 2022)
- **Tipografía:** Roboto (Regular/Bold/Black) + Roboto Condensed (Bold/Black) + Roboto Mono. Salieron Bricolage Grotesque, Inter Tight, Instrument Serif.
- **Paleta exacta:**
  - Verde `#5ECA00` (Pantone 802 C) — acción
  - Violeta `#3D3083` (Pantone Violet) — identidad/gestión
  - Verde oscuro `#679340` — secundario
  - Negro `#0a0a0a` (Pantone Black, ajustado para pantalla)
- **Isologo nuevo:** dos cuadrados intersectados (violeta + negro) con cuadrado verde central que contiene la **cerradura** — fiel a la "metáfora de la contención" del manual.
- **Logotipo:** "m**i**container" con la "i" en verde como acento, según especifica el manual.

### Sistema de color funcional
- **Verde** = acción (CTAs primarias, badges activos, "reservar")
- **Violeta** = identidad/gestión (portal cliente, progreso del wizard, eyebrows secundarios, "acceso clientes", QR del cliente)
- **Negro** = texto y superficies oscuras
- **Cream `#f7f4ec`** = paper base

### Autogestión (la app ahora es funcional, no solo landing)

**Wizard de reserva — 4 pasos:**
1. Elegir tamaño (4 opciones, cards seleccionables)
2. Fecha de inicio + duración estimada
3. Add-ons opcionales: retiro a domicilio, kit de embalaje, candado, seguro
4. Datos del cliente (nombre, email, teléfono, DNI) + resumen con total + forma de pago + confirmación

**Portal cliente** (`#/portal`):
- Login mágico por email (mock, sin contraseña)
- Dashboard con reservas activas + resumen (cantidad, mensual total, email)
- Detalle de reserva (`#/portal/r/:id`) con:
  - Datos completos
  - **Credencial digital QR** generada en violeta brand sobre cream
  - Acciones: descargar factura, cambiar tamaño, pausar, cancelar

**Persistencia:** todo se guarda en `localStorage` (`mc.user`, `mc.reservations`). Hasta tener backend, el flujo completo funciona client-side: una persona puede reservar, salir, volver, y encontrar su reserva en el portal.

### Hash routing
- `#/` → home
- `#/reservar` → home con wizard abierto
- `#/portal` → dashboard o login
- `#/portal/r/MC-XXXX-XXXX` → detalle de reserva

### Nuevas secciones en la home
- **"Empresa autogestiva"** — dos cards lado a lado: Reservar (violeta gradient) + Portal (negro con halo violeta)
- **Hero retitulado:** "Tu espacio, cuando lo necesites." con énfasis en autogestión
- **FAQ ampliado:** preguntas sobre acceso por QR, cambiar de tamaño desde el portal, etc.

## Cómo correr local

```bash
npx serve@latest .
```

Después `http://localhost:3000` (o el puerto que asigne).

## Roadmap (lo que falta para producción)

- Backend real (Node/Postgres o Firebase) para reservas, usuarios, facturación
- Integración real con Mercado Pago / Stripe en el paso 4 del wizard
- Email transaccional (Resend / Postmark) con credencial + recibo
- Autenticación real (magic link OTP por email)
- QR firmado para validar acceso físico (HMAC + timestamp)
- Panel admin para gestionar inventario, ocupación, contratos
