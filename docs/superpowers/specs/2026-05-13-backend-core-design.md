# Mi Container — Backend Core: Diseño

**Fecha:** 2026-05-13  
**Entidad facturadora:** CORDIS MS SA (dueña de Nordelta) · Agustín M. García 10297, Benavídez (1621), Tigre, Buenos Aires  
**Operadora:** Mi Container  
**Scope:** Auth + Reservaciones + Mercado Pago Suscripciones + Enrollment Hikvision + Panel Admin

---

## 1. Stack e infraestructura

| Servicio | Rol | Costo inicial |
|---|---|---|
| **Firebase Auth** | Login Google OAuth + Email Magic Link | Free |
| **Firestore** | Base de datos (users, reservations, payments, logs) | Free (<50K reads/day) |
| **Cloud Functions** (Node.js 20) | API endpoints + webhooks + background jobs | Free (<2M calls/mes) |
| **Cloud Tasks** | Cola de reintentos para Hikvision enrollment | Free (<1M tasks/mes) |
| **Firebase Storage** | Selfies temporales durante enrollment (borradas post-enroll) | Free (<5 GB) |
| **Firebase Secret Manager** | Credenciales Hikvision, MP Access Token cifrados | Free (<6 versiones) |
| **Firebase Hosting** | Admin panel web | Free |
| **Resend** | Emails transaccionales (confirmación, factura, acceso) | Free (<100/día) |
| **Mercado Pago API** | Suscripciones mensuales con tarjeta de crédito | Comisión MP |
| **Hikvision ISAPI** | Enrollment facial + revocación de acceso | Ya instalado |

**Costo total mes 1:** $0 (escala a ~$20–30/mes después de 500 clientes activos)

### Proyecto Firebase
- Nombre: `micontainer-prod`
- Region: `us-central1` (menor latencia a Argentina que sa-east-1 y más barato)
- Blaze plan activado (necesario para llamadas a APIs externas desde Functions)

---

## 2. Modelo de datos (Firestore)

### `/users/{uid}`
Creado en el primer login. `uid` = Firebase Auth UID.

```json
{
  "uid": "firebase-uid",
  "email": "julia@gmail.com",
  "name": "Julia Martínez",
  "phone": "+5491155554321",
  "clientType": "persona",
  "dni": "34123456",
  "razonSocial": null,
  "cuit": null,
  "role": "client",
  "createdAt": "timestamp",
  "biometricConsent": false,
  "biometricConsentAt": null,
  "hikUserId": null,
  "faceEnrolled": false,
  "faceEnrolledAt": null
}
```

`role`: `"client"` | `"admin"` — seteado via Firebase Custom Claims (nunca editable desde el frontend).

### `/reservations/{reservationId}`
`reservationId` = código `MC-XXXX-XXXX` generado en el backend.

```json
{
  "id": "MC-XXXX-XXXX",
  "userUid": "firebase-uid",
  "sucursalId": "nordelta",
  "category": "mediano",
  "m2": 6.00,
  "monthly": 151200,
  "firstMonth": 0,
  "startDate": "2026-05-14",
  "duration": 3,
  "addons": ["pickup"],
  "promosApplied": ["first-month-free"],
  "status": "pending_payment",
  "mpPreapprovalId": null,
  "mpSubscriptionStatus": "pending",
  "faceEnrollStatus": "not_started",
  "faceEnrollAttempts": 0,
  "cancelledAt": null,
  "createdAt": "timestamp"
}
```

**Estados de `status`:**
- `pending_payment` → reserva creada, esperando que MP confirme
- `active` → pago confirmado, acceso activo
- `cancelled` → cancelada por el cliente
- `payment_failed` → MP no pudo cobrar después de reintentos

**Estados de `faceEnrollStatus`:**
- `not_started` → cliente aún no inició el proceso
- `queued` → tarea en Cola de Cloud Tasks
- `enrolled` → cara registrada en Hikvision
- `failed` → falló 3 veces, requiere intervención manual
- `revoked` → acceso revocado (por cancelación o falta de pago)

### `/payments/{paymentId}`
Un documento por cada evento de pago recibido del webhook de MP.

```json
{
  "reservationId": "MC-XXXX-XXXX",
  "userUid": "firebase-uid",
  "mpPreapprovalId": "2c938084...",
  "mpPaymentId": "123456789",
  "type": "recurring_payment",
  "amount": 151200,
  "currency": "ARS",
  "status": "approved",
  "period": "2026-05",
  "receivedAt": "timestamp"
}
```

### `/access_logs/{logId}`
Recibido del webhook de Hikvision (entrada/salida).

```json
{
  "userUid": "firebase-uid",
  "reservationId": "MC-XXXX-XXXX",
  "sucursalId": "nordelta",
  "event": "entry",
  "timestamp": "timestamp",
  "deviceId": "HK-DOOR-01"
}
```

### `/sucursales/{sucursalId}`
Leída solo por el backend (Functions). Nunca expuesta al frontend.

```json
{
  "id": "nordelta",
  "name": "Nordelta",
  "hikBaseUrl": "http://189.x.x.x:80",
  "hikUserSecret": "sm://micontainer-prod/hik-nordelta-user",
  "hikPassSecret": "sm://micontainer-prod/hik-nordelta-pass",
  "timezone": "America/Argentina/Buenos_Aires",
  "active": true
}
```

Credenciales referenciadas como secrets (nunca en texto plano).

---

## 3. Endpoints de Cloud Functions

### API cliente (requieren JWT Firebase en header `Authorization: Bearer <token>`)

| Método | Ruta | Descripción |
|---|---|---|
| `POST` | `/reservations` | Crear reserva + iniciar suscripción MP |
| `GET` | `/reservations` | Listar reservas del cliente autenticado |
| `GET` | `/reservations/:id` | Detalle de una reserva |
| `POST` | `/reservations/:id/cancel` | Cancelar (cancela MP + revoca Hikvision) |
| `POST` | `/reservations/:id/enroll-face` | Iniciar enrollment facial (opcional, en cualquier momento) |

### Webhooks (sin auth JWT, verificación por firma)

| Método | Ruta | Descripción |
|---|---|---|
| `POST` | `/webhooks/mp` | Eventos de Mercado Pago (pago, fallo, cancelación) |
| `POST` | `/webhooks/hik` | Eventos de acceso Hikvision (entrada/salida) |

### API admin (requieren rol `admin` en Custom Claims)

| Método | Ruta | Descripción |
|---|---|---|
| `GET` | `/admin/reservations` | Todas las reservas (con filtros) |
| `GET` | `/admin/clients` | Todos los clientes |
| `POST` | `/admin/reservations/:id/enroll-face` | Enrollment manual desde admin |
| `POST` | `/admin/reservations/:id/revoke-access` | Revocar acceso manualmente |
| `PATCH` | `/admin/reservations/:id/status` | Cambiar estado de una reserva |
| `GET` | `/admin/access-logs` | Logs de entrada/salida |
| `GET` | `/admin/revenue` | Revenue del mes (suma de /payments) |

---

## 4. Flujos detallados

### Flujo 1 — Auth + creación de usuario

```
Cliente hace click "Acceso clientes"
  → Firebase Auth: popup Google o email magic link
  → Firebase emite JWT con uid
  → Cloud Function (onUserCreate trigger):
      - Crea /users/{uid} con datos del perfil de Google
  → Frontend guarda token, redirige al portal
```

### Flujo 2 — Reserva + pago (flujo principal)

```
1. Cliente completa wizard (5 pasos, sin selfie)
   → Frontend llama POST /reservations con JWT

2. Cloud Function:
   → Valida JWT, extrae uid
   → Genera reservationId = MC-XXXX-XXXX
   → Llama MP API: POST /preapproval
      {
        reason: "Mi Container - Mediano 6m² (MC-XXXX-XXXX)",
        auto_recurring: {
          frequency: 1,
          frequency_type: "months",
          transaction_amount: 151200,
          currency_id: "ARS"
        },
        payer_email: "julia@gmail.com",
        back_url: "https://augusto-pmd.github.io/Micofrontend/#/portal"
      }
   → MP devuelve { preapproval_id, init_point }
   → Crea /reservations/{id} con status: "pending_payment"
   → Devuelve { reservationId, init_point } al frontend

3. Frontend redirige cliente a init_point (MP checkout)
   → Cliente autoriza la suscripción con su tarjeta

4. MP cobra el primer mes → dispara webhook POST /webhooks/mp

5. Cloud Function /webhooks/mp:
   → Verifica firma HMAC del webhook
   → Si status == "approved":
       - Actualiza /reservations: status → "active", mpSubscriptionStatus → "approved"
       - Crea /payments/{id}
       - Envía email de confirmación (Resend)
   → Guarda el evento en /payments independientemente del status
```

### Flujo 3 — Enrollment facial (opcional, en cualquier momento)

El cliente puede iniciar esto desde el portal cuando quiera.
El admin también puede dispararlo desde el panel.

```
1. Cliente en portal → "Activar acceso facial"
   → Acepta consentimiento biométrico (Ley 25.326)
   → Sube selfie (foto frontal, mínimo 640x480px)
   → Frontend sube foto a Firebase Storage: /face-temp/{uid}/selfie.jpg
   → Llama POST /reservations/:id/enroll-face

2. Cloud Function:
   → Valida que la reserva esté "active"
   → Actualiza faceEnrollStatus: "queued"
   → Encola tarea en Cloud Tasks: enroll_face
      { reservationId, uid, sucursalId, photoPath }

3. Cloud Task ejecuta enroll_face:
   → Descarga foto de Storage
   → Lee credenciales Hikvision de Secret Manager
   → Llama ISAPI:
      PUT /ISAPI/AccessControl/UserInfo/SetUp
        { employeeNo: "HK-{uid}", name: "Julia Martínez", ... }
      PUT /ISAPI/Smart/FaceDataRecord/SetUp
        { employeeNo: "HK-{uid}", faceData: <base64> }
   → Si OK:
       - Actualiza /users: hikUserId, faceEnrolled: true, faceEnrolledAt
       - Actualiza /reservations: faceEnrollStatus → "enrolled"
       - Borra foto de Storage (no se almacena post-enrollment)
       - Envía email: "Tu acceso facial está activo en Nordelta"
   → Si falla:
       - Incrementa faceEnrollAttempts
       - Si attempts < 3: reencola con delay 5 min
       - Si attempts == 3: faceEnrollStatus → "failed"
                           Notificación al admin en Firestore
```

### Flujo 4 — Revocación de acceso

Disparado por: cancelación del cliente, fallo de pago de MP, o admin manualmente.

```
Cloud Function:
  → Actualiza /reservations: status → "cancelled" / "payment_failed"
  → Si faceEnrolled == true:
      Lee hikUserId del usuario
      Llama ISAPI:
        DELETE /ISAPI/AccessControl/UserInfo/Delete?employeeNo=HK-{uid}
      Actualiza /users: faceEnrolled: false
      Actualiza /reservations: faceEnrollStatus → "revoked"
  → Envía email al cliente
  → Si payment_failed: email con link para actualizar tarjeta en MP
```

### Flujo 5 — Cobro mensual (MP lo maneja automáticamente)

```
MP cobra cada mes → webhook POST /webhooks/mp
  → Cloud Function guarda /payments/{id}
  → Actualiza /reservations: últimoCobroAt
  → Envía email recibo
  → Si falla el cobro:
      MP reintenta (según config de la suscripción)
      Si definitivamente falla: webhook con status "cancelled"
      → Inicia Flujo 4
```

---

## 5. Panel Admin

App React separada, hosteada en Firebase Hosting, accesible solo para usuarios con `role: "admin"`.

### Vistas

**Dashboard principal**
- KPIs: reservas activas, revenue del mes, ingresos vs mes anterior
- Alertas pendientes: enrollments fallidos, pagos fallidos

**Reservaciones** (`/admin/reservations`)
- Tabla filtrable por sucursal / estado / fecha
- Búsqueda por nombre, email, código MC-XXXX
- Por cada reserva: ver detalle, activar enrollment, revocar acceso, cambiar estado
- Badge de color por estado: verde (active) / amarillo (pending) / rojo (failed/cancelled)

**Clientes** (`/admin/clients`)
- Lista de todos los clientes con estado de reserva y facial enrollment
- Click → perfil completo + historial de pagos + log de accesos

**Logs de acceso** (`/admin/access-logs`)
- Timeline de entradas/salidas por sucursal
- Filtro por cliente, sucursal, rango de fechas

**Revenue** (`/admin/revenue`)
- Total cobrado por mes
- Desglose por categoría de espacio
- Próximos cobros del mes (todas las suscripciones activas)

### Gestión de roles
- Usuarios admin creados manualmente por Augusto vía Firebase Console
  (o endpoint interno `POST /admin/set-role`)
- No hay registro público de admins

---

## 6. Privacidad y seguridad

### Ley 25.326 (datos biométricos)
- Consentimiento explícito antes del enrollment (checkbox + texto legal visible)
- Fecha y hora del consentimiento guardadas en `/users/{uid}.biometricConsentAt`
- La foto se almacena **máximo 24hs** en Firebase Storage; post-enrollment se borra
- El dato biométrico real reside **solo en Hikvision** (Mi Container no almacena la cara)
- El cliente puede solicitar eliminación desde el portal → revocación + borrado de hikUserId

### Seguridad de la API
- Todos los endpoints cliente requieren JWT válido de Firebase Auth
- Todos los endpoints admin verifican Custom Claim `role: "admin"`
- Webhook de MP verificado con HMAC-SHA256 (clave del Secret Manager)
- Credenciales Hikvision solo en Secret Manager (nunca en código ni Firestore)
- Reglas de Firestore: cliente solo lee sus propios documentos; admin puede leer todo

### Rate limiting
- Cloud Functions tiene rate limiting nativo
- Endpoint `/reservations` limitado a 5 llamadas/min por uid (evitar abuso)

---

## 7. Emails transaccionales (Resend)

| Trigger | Asunto | Contenido |
|---|---|---|
| Reserva creada | "Reserva MC-XXXX confirmada" | Detalle + link al portal |
| Pago confirmado | "Pago recibido — $X" | Recibo + instrucciones de acceso |
| Enrollment completado | "Tu acceso facial está activo" | Instrucciones para primera visita |
| Enrollment fallido | "Acción requerida: acceso pendiente" | Link para reintentar o contactar |
| Pago fallido | "Problema con tu pago" | Link para actualizar tarjeta en MP |
| Cancelación | "Reserva cancelada" | Confirmación + fecha efectiva |
| Cobro mensual | "Recibo de Mi Container — [mes]" | Monto + periodo |

---

## 8. Secuencia de implementación (MVP)

1. **Crear proyecto Firebase** + configurar Auth (Google + magic link)
2. **Reglas de Firestore** + estructura de colecciones
3. **Cloud Function: POST /reservations** + integración MP preapproval
4. **Cloud Function: POST /webhooks/mp** + activar reserva
5. **Cloud Tasks + enrollment Hikvision** (flujo opcional, no bloquea reserva)
6. **Flujo de revocación** (cancelación + pago fallido)
7. **Emails con Resend**
8. **Conectar frontend** (reemplazar localStorage con llamadas reales a Functions)
9. **Panel admin** (React, Firebase Hosting)
10. **Test end-to-end** en sandbox de MP + Hikvision de prueba

---

## Pendientes para definir antes de implementar

- IP pública del Hikvision Nordelta y credenciales de acceso a la ISAPI
- MP Access Token de producción (para configurar en Secret Manager)
- Email `info@micontainer.com` configurado en Resend (o dominio verificado)
- Decisión: ¿el panel admin va en `admin.micontainer.com` o en una ruta del mismo dominio?
