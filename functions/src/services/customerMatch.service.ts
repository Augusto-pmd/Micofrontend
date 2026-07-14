import { db } from '../config/firebase';
import * as crypto from 'crypto';

// MACHEO REFORZADO DE CLIENTE (SPEC: unir las bauleras de un mismo cliente aunque el mail venga
// distinto). Para HEREDAR IDENTIDAD (reusar userUid / unir en el portal) solo se usan datos FUERTES:
// DNI/CUIT (único por persona) y email (verificable). El TELÉFONO y el NOMBRE NO heredan identidad —
// son débiles (línea de hogar/negocio compartida, homónimos, typos) y una colisión pisaría el
// registro/portal de OTRA persona. El teléfono normalizado SÍ se guarda y sirve para la BÚSQUEDA del
// dashboard (read-only, no reusa uid ni escribe).
//
// Guardamos versiones NORMALIZADas (solo dígitos / minúsculas) en la reserva para poder matchear
// con equality de Firestore sin que el formato ("12.345.678" vs "12345678", mayúsculas) rompa el
// cruce. Las reservas viejas (pre-cambio) no tienen los *Norm → matchean por email/uid como antes;
// un backfill opcional las normaliza para que también crucen por DNI.

export function normDni(v?: string | null): string {
  return String(v || '').replace(/\D/g, ''); // solo dígitos (saca puntos, guiones, espacios)
}
export function normPhone(v?: string | null): string {
  const d = String(v || '').replace(/\D/g, '');
  return d.length > 10 ? d.slice(-10) : d; // últimos 10 dígitos: ignora prefijo país (54) y 0/15
}
export function normEmail(v?: string | null): string {
  return String(v || '').trim().toLowerCase();
}

// Campos normalizados a estampar en CADA reserva nueva (para que el macheo futuro sea robusto).
export function customerNormFields(p: { email?: string; dni?: string; phone?: string }): {
  customerEmailNorm: string | null; customerDniNorm: string | null; customerPhoneNorm: string | null;
} {
  return {
    customerEmailNorm: normEmail(p.email) || null,
    customerDniNorm: normDni(p.dni) || null,
    customerPhoneNorm: normPhone(p.phone) || null,
  };
}

export interface CustomerIdentity { userUid: string; email: string; matchedBy: 'dni' | 'email'; }

// Busca un cliente EXISTENTE por (DNI → email) entre las reservas ya cargadas y devuelve la identidad
// canónica (userUid + email) de la reserva MÁS VIEJA que matchea. Así una venta nueva del mismo
// cliente se ATA a esa identidad (se unifica en el portal) aunque use otro mail. SOLO DNI (único por
// persona) y email (verificable): el TELÉFONO NO se usa para HEREDAR identidad — es débil (línea de
// hogar/negocio, typo) y una colisión pisaría el registro/portal de OTRA persona (bug confirmado en
// la revisión). El nombre tampoco (homónimos). BEST-EFFORT: el caller la envuelve en try/catch — si
// falla, la venta sigue con el uid derivado del mail. No inventa: solo lee reservas reales.
export async function resolveExistingCustomer(p: { dni?: string; email?: string }): Promise<CustomerIdentity | null> {
  const dni = normDni(p.dni);
  const email = normEmail(p.email);

  // (campo a consultar, valor, con qué matcheó) en orden de confianza. Guard de largo mínimo: NO
  // matchear por DNI basura o corto ("0", "123") que uniría por error a dos personas distintas.
  const tries: Array<{ field: string; value: string; by: 'dni' | 'email' }> = [];
  if (dni.length >= 7) tries.push({ field: 'customerDniNorm', value: dni, by: 'dni' });
  if (email) tries.push({ field: 'customerEmailNorm', value: email, by: 'email' });

  for (const t of tries) {
    const snap = await db.collection('reservations').where(t.field, '==', t.value).get();
    if (snap.empty) continue;
    // La MÁS VIEJA (createdAt asc) define la identidad canónica del cliente.
    const docs = snap.docs.slice().sort((a, b) => {
      const ta = (a.data() as Record<string, { toMillis?: () => number }>)['createdAt']?.toMillis?.() || 0;
      const tb = (b.data() as Record<string, { toMillis?: () => number }>)['createdAt']?.toMillis?.() || 0;
      return ta - tb;
    });
    const r = docs[0].data() as Record<string, unknown>;
    return { userUid: String(r['userUid'] || ''), email: normEmail(String(r['customerEmail'] || '')) || email, matchedBy: t.by };
  }
  return null;
}

// Para las VENTAS del admin (que no tienen uid de Firebase del cliente): devuelve el userUid de un
// cliente existente (macheo por DNI→email→tel) o, si no hay match, el fallback determinístico por
// email (idéntico al comportamiento de hoy: `manual_<hash email>`). Best-effort: nunca tira.
export async function resolveSaleUid(p: { dni?: string; email?: string; phone?: string }): Promise<string> {
  const fallback = `manual_${crypto.createHash('sha1').update(String(p.email || '').toLowerCase()).digest('hex').slice(0, 16)}`;
  try {
    const found = await resolveExistingCustomer(p);
    return found?.userUid || fallback;
  } catch (e) { console.warn('[customerMatch] resolveSaleUid falló (uso fallback por email):', e); return fallback; }
}

// Trae TODAS las reservas de un cliente uniendo por email, uid y — para atrapar reservas cargadas
// con OTRO mail — por el DNI/teléfono normalizados que aparezcan en sus reservas conocidas (2° salto).
// Lo usa el portal para que el cliente vea todas sus bauleras juntas. Best-effort en el 2° salto.
export async function collectClientReservationDocs(
  email: string, uid?: string,
): Promise<FirebaseFirestore.QueryDocumentSnapshot[]> {
  const e = normEmail(email);
  const [byEmail, byEmailNorm, byUid] = await Promise.all([
    db.collection('reservations').where('customerEmail', '==', email).get(),
    e ? db.collection('reservations').where('customerEmailNorm', '==', e).get() : Promise.resolve({ docs: [] as FirebaseFirestore.QueryDocumentSnapshot[] }),
    uid ? db.collection('reservations').where('userUid', '==', uid).get() : Promise.resolve({ docs: [] as FirebaseFirestore.QueryDocumentSnapshot[] }),
  ]);
  const map = new Map<string, FirebaseFirestore.QueryDocumentSnapshot>();
  for (const d of byEmail.docs) map.set(d.id, d);
  for (const d of (byEmailNorm as { docs: FirebaseFirestore.QueryDocumentSnapshot[] }).docs) if (!map.has(d.id)) map.set(d.id, d);
  for (const d of (byUid as { docs: FirebaseFirestore.QueryDocumentSnapshot[] }).docs) if (!map.has(d.id)) map.set(d.id, d);

  // 2° salto: SOLO por DNI (único por persona) → reservas del mismo cliente cargadas con otro mail.
  // El teléfono NO se usa acá: es débil (línea compartida/typo) y expandir por él podría mostrarle a
  // un cliente la baulera de OTRO en su portal (fuga de datos). El DNI, con guard de largo, es seguro.
  try {
    const dnis = new Set<string>();
    for (const d of map.values()) {
      const r = d.data() as Record<string, unknown>;
      const dn = normDni(String(r['customerDniNorm'] || r['customerDni'] || '')); if (dn.length >= 7) dnis.add(dn);
    }
    const snaps = await Promise.all(
      [...dnis].slice(0, 10).map((dn) => db.collection('reservations').where('customerDniNorm', '==', dn).get()),
    );
    for (const s of snaps) for (const d of s.docs) if (!map.has(d.id)) map.set(d.id, d);
  } catch (e2) { console.warn('[customerMatch] 2° salto DNI falló (sigo con email/uid):', e2); }

  return [...map.values()];
}
