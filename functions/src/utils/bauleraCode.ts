// CRITERIO ÚNICO DE IGUALDAD DE CÓDIGO DE BAULERA (unificación 30/07, orden Lucas).
//
// La spec ya lo definía (docs/secciones/16-tarifas.md): "matcheo por external_reference = código de
// baulera (contra storageRooms.space), robusto a los DOS formatos (A1-013 y A0013, canonicaliza
// guión/espacios) + fallback por email". El problema era que ese criterio vivía COPIADO en siete
// lugares del backend y tres de esas copias divergían, así que la misma baulera matcheaba en una
// pantalla y no en otra. Este módulo es la única fuente de verdad: es COPIA LITERAL de la versión
// del reprice (admin/pricing.ts), que es la que la spec documenta y la que ya venía andando en
// producción (77/87 suscripciones matcheadas).
//
// REGLA DURA: dos códigos de baulera se comparan SIEMPRE con canon(a) === canon(b).
// Nunca con === sobre el texto crudo (pierde "A2-25" contra "A2-025") ni con includes()
// (un código puede ser el principio de otro y cancelar/asignar la baulera equivocada).

// Canonicaliza el código para matchear todos los formatos por igual:
// "A2-025" = "A2-25" = "A2025" = "A0013" -> fila + unidad SIN ceros a la izquierda.
// (MP guarda "A2-25" pero el inventario "A2-025"; sin esto no matcheaban.)
export const canon = (c: string): string => {
  const s = String(c || '').toUpperCase();
  const m = s.match(/([A-Z]\d)\D*0*(\d+)/); // fila (A2) + unidad sin ceros izq
  return m ? m[1] + m[2] : s.replace(/[^A-Z0-9]/g, '');
};

// Extrae el codigo del external_reference ("MiContainer Baulera A2-010" -> "A2-010"; o "...A0013" -> "A0013").
// Requiere guion, o 3+ digitos si no hay guion (evita falsos como "m2").
export const codeOf = (ext: string): string => { const m = String(ext || '').match(/[A-Za-z]\d+-\d+|[A-Za-z]\d{3,}/); return m ? canon(m[0]) : ''; };

// Igual que codeOf pero DESCARTA las referencias que no son un código de baulera. Es obligatorio
// usar ésta (y no codeOf a secas) sobre un external_reference que puede venir de cualquier vía:
//  - "MC-...": es un ID DE RESERVA, no una baulera. generateReservationId mezcla letras y dígitos,
//    así que un id como "MC-A123-4567" hace match con codeOf y fabricaría el código falso "A123",
//    que podría coincidir con una baulera real (A1-023 canoniza a "A123").
//  - "DEUDA " / "GAP ": son pagos únicos que NO tocan la suscripción ni la baulera.
//  - "ONETIME ": es una venta de pago único; el prefijo se saca y el resto sí es un código válido.
export const codigoDeRef = (ext: string): string => {
  const s = String(ext || '').trim().replace(/^ONETIME\s+/i, '');
  if (!s || /^(MC-|DEUDA\s|GAP\s)/i.test(s)) return '';
  return codeOf(s);
};

// NO UNIFICADOS A PROPÓSITO (son CLAVES, no comparadores — cambiarles la normalización dejaría
// huérfanos los documentos ya escritos con la clave vieja):
//  - planCatalog.service.ts `codeKey`: arma el doc id de mpPlans. Solo necesita ser estable consigo
//    misma, y lo es porque siempre parte de storageRooms.space.
//  - debts.service.ts `canon`: indexa las deudas por baulera. Las deudas ya cargadas se buscan con
//    la normalización con la que se guardaron.
