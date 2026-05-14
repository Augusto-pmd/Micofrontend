# Mi Container — Portal Cliente UX: Diseño

**Fecha:** 2026-05-13
**Scope:** Portal post-reserva — acceso facial, pagos, gestión de reserva

---

## 1. Contexto y principios

El portal es lo que el cliente ve **después de reservar**. Su objetivo primario, en orden de importancia:

1. Verificar que su reserva está activa y el pago confirmado
2. Activar su acceso facial (sin esto no puede entrar al local)
3. Ver sus pagos e historial de facturas
4. Gestionar su reserva (cambiar tamaño o cancelar)

**Acceso físico:** 100% face ID (Hikvision). Sin QR.
**Facturación:** Facturante vía API de Mercado Pago — el portal muestra links, no genera facturas.
**Pausa:** No existe. Si el cliente quiere dejar de pagar, cancela.

---

## 2. Flujo de entrada al portal

```
Login
  └── 0 reservas  →  Pantalla vacía + "Reservá tu primer espacio →"
  └── 1 reserva   →  Pantalla de reserva directamente (sin lista)
  └── 2+ reservas →  Selector de reservas (tarjetas: sucursal + estado)
                       └── elige una → Pantalla de reserva
```

El caso más común (1 reserva) no tiene fricción adicional.

---

## 3. Pantalla de reserva

Página vertical continua, sin tabs. Cuatro bloques en orden:

```
HEADER — Espacio + estado
──────────────────────────
1. ACCESO FACIAL
──────────────────────────
2. PRÓXIMO PAGO
──────────────────────────
3. TU ESPACIO
──────────────────────────
4. GESTIONAR
```

### Header

- Nombre de categoría + sucursal (ej: "Mediano · Nordelta")
- Badge de estado:
  - `active` → verde · "Activa · desde hace X días"
  - `pending_payment` → amarillo · "Esperando confirmación de pago"
  - `cancellation_scheduled` → naranja · "Cancela el {fecha}"
  - `cancelled` → gris · "Cancelada"
  - `payment_failed` → rojo · "Pago fallido"

---

## 4. Bloque 1 — Acceso facial

El más importante. Cuatro estados:

### A — No iniciado
Reserva activa pero sin face ID enrollado.

- Ícono de candado cerrado
- Título: "Activá tu acceso al local"
- Copy: "Tu espacio está listo. Solo falta registrar tu cara para entrar."
- CTA prominente: **"Activar acceso →"**
- Nota: "Solo necesitás una foto — tarda 2 minutos"

### B — Procesando (queued / enrolling)
Foto enviada, esperando respuesta de Hikvision.

- Spinner animado
- Título: "Activando tu acceso..."
- Copy: "Estamos registrando tu cara en {sucursal}. En minutos recibís un email."

### C — Activo ✅
Face ID enrollado y funcionando.

- Ícono de check verde
- Título: "ACCESO ACTIVO — {SUCURSAL}"
- Copy: "Podés entrar las 24 hs. Tu cara es tu credencial."
- Info contextual: horarios de atención de la sucursal

### D — Error
Hikvision rechazó la foto o falló el enrollment.

- Ícono de alerta amarilla
- Título: "Error al activar el acceso"
- Copy: "La foto no cumplió los requisitos."
- Dos CTAs: **"Intentar de nuevo"** + **"Contactar por WhatsApp"**

---

## 5. Flujo de activación facial (inline en portal)

3 pasos dentro del mismo portal, sin navegación externa:

### Paso 1 — Consentimiento biométrico
- Checkbox requerido (Ley 25.326 Argentina)
- Texto legal completo visible (datos biométricos, uso exclusivo de acceso)
- Fecha y hora del consentimiento guardadas en `/users/{uid}.biometricConsentAt`
- No se puede avanzar sin el check

### Paso 2 — Foto
- Input de cámara/archivo (foto frontal)
- Preview antes de confirmar
- Requisitos visibles: buena iluminación, cara centrada, sin lentes de sol
- Tamaño mínimo: 640×480px
- Se sube a Firebase Storage: `/face-temp/{uid}/selfie.jpg`
- La foto se borra automáticamente post-enrollment (máximo 24hs)

### Paso 3 — Enviado
- Spinner + "Procesando..."
- Transición a Estado B (procesando) cuando Cloud Tasks encola la tarea
- Mensaje: "Te avisamos por email cuando tu acceso esté listo"

---

## 6. Bloque 2 — Próximo pago

### Pago al día
- Monto mensual + fecha del próximo cobro
- Historial de últimos 3–6 pagos:
  - Fecha · Monto · Link "ver factura ↗" (abre URL de Facturante en nueva pestaña)
  - Los primeros meses gratuitos se muestran como "$0 (1° mes gratis)"

### Pago fallido
- Banner rojo/naranja arriba del bloque
- Mensaje: "No pudimos cobrar el {fecha}. Tu acceso se suspende el {fecha + 7 días}."
- CTA: **"Actualizar tarjeta en Mercado Pago →"** (abre MP en nueva pestaña)

---

## 7. Bloque 3 — Tu espacio

Solo los datos que el cliente necesita consultar:

- Categoría + m² (ej: "Mediano · 6 m²")
- Sucursal + dirección
- Horarios de atención
- Add-ons activos (si tiene)
- Fecha de inicio

Sin IDs de reserva, sin datos técnicos. Diseño limpio tipo tarjeta de información.

---

## 8. Bloque 4 — Gestionar

Dos acciones:

### Cambiar de tamaño

**Pantalla/modal encima de la vista:**

1. Muestra tamaño actual destacado
2. Lista de otras opciones disponibles en la misma sucursal con precios actualizados
3. Cliente selecciona nueva opción
4. Confirmación: *"Solicitud enviada — te avisamos por email en 24hs hábiles"*

**Efectos en el sistema:**
- Escribe documento en Firestore `/resize_requests/{id}`:
  ```json
  {
    "reservationId": "MC-XXXX-XXXX",
    "userUid": "...",
    "currentM2": 6,
    "requestedM2": 9,
    "requestedMonthly": 207900,
    "status": "pending",
    "createdAt": "timestamp"
  }
  ```
- El admin panel muestra estas solicitudes con alerta
- El equipo recibe notificación (email o push)
- La reserva no cambia hasta que el admin confirma

### Cancelar reserva

**Flujo en 2 pasos:**

1. Modal de confirmación:
   - Fecha efectiva: hoy + 7 días
   - Monto que ya no se cobra (si corresponde)
   - Botón: **"Cancelar definitivamente"** (rojo)

2. Confirmado:
   - Estado de la reserva → `cancellation_scheduled`
   - `cancelledAt` = fecha efectiva (hoy + 7 días)
   - Header muestra badge naranja: "Cancela el {fecha}"
   - Mercado Pago cancela la suscripción via webhook o llamada directa
   - Email de confirmación al cliente

**Botón Cancelar:**
- Texto discreto, no rojo prominence (no queremos que sea el primero que noten)
- Separado visualmente del botón de cambio de tamaño

---

## 9. Pantalla vacía (sin reservas)

Para usuarios que se loguearon pero no tienen reservas activas:

- Copy: "Todavía no tenés espacios guardados."
- CTA grande: **"Reservá tu espacio →"** (abre el wizard)
- Subtext: beneficios rápidos (5 min · sin depósito · 1° mes gratis)

---

## 10. Selector de reservas (2+ reservas)

Para el caso poco frecuente de múltiples reservas:

- Grid de tarjetas compactas
- Cada tarjeta: categoría · sucursal · m² · estado badge
- Al hacer click → pantalla de reserva de esa reserva
- "+ Nueva reserva" al final del grid → abre wizard

---

## 11. Notificaciones al equipo

Dos eventos generan notificación interna:

| Evento | Mecanismo |
|--------|-----------|
| Solicitud de cambio de tamaño | Documento en `/resize_requests` + email via Resend a `am@micontainer.com` |
| Cancelación | Actualización en `/reservations` + email via Resend |

El panel admin (Plan 4) muestra las solicitudes pendientes en el dashboard con badge de alerta.

---

## 12. Rutas de hash

| Vista | Hash |
|-------|------|
| Portal (auto-redirect) | `#/portal` |
| Reserva específica | `#/portal/r/{reservationId}` |
| Activar acceso | `#/portal/r/{reservationId}/acceso` |
| Cambiar tamaño | `#/portal/r/{reservationId}/cambiar` |

---

## 13. Estados de reserva en portal

| Estado Firestore | Lo que ve el cliente |
|-----------------|----------------------|
| `pending_payment` | Badge amarillo · "Esperando pago" |
| `active` | Badge verde · "Activa desde hace X días" |
| `payment_failed` | Banner rojo · "Pago fallido — actualizá tarjeta" |
| `cancellation_scheduled` | Badge naranja · "Cancela el {fecha}" |
| `cancelled` | Badge gris · "Cancelada" |
