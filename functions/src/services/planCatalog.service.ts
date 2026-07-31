import { db } from '../config/firebase';
import { createPlan, updatePlanBilling, FreeTrialUnit, MpPlanCreated } from './mercadopago.service';

// Catálogo de PLANES ALINEADOS AL 1° (SPEC cobros-alineados §4 + Paso 0).
//
// Por qué planes: el spike del 13/07 confirmó que /preapproval (sub directa) IGNORA billing_day
// y que no se puede crear una sub asociada a un plan por API sin card token → TODA venta nueva
// (web, /sell, /sell-plan) genera su suscripción vía LINK DE PLAN con billing_day=1 +
// billing_day_proportional=true (MP cobra el proporcional al entrar y el mes completo cada 1°).
//
// Reuso: un plan por (m2 × trial), guardado en mpPlans con la MISMA clave que usaba sell-plan
// (`m2-<m2>-trial<q><d|m>`; sin trial: `m2-<m2>-alin1`). Si el monto de la venta difiere del plan
// (tarifa nueva, promo, override) se actualiza el plan ANTES de entregar el link (comportamiento
// que ya tenía sell-plan). Si el doc es viejo y no tiene billingDay, se hace el PUT de upgrade.
// CAVEAT documentado: el plan es compartido por medida — dos ventas simultáneas de la misma medida
// con montos distintos pisan el monto del plan (riesgo bajo, igual que sell-plan desde el 11/07).
// CLAVE del catálogo (doc id en mpPlans). Incluye el MONTO: el plan (y su init_point) es compartido
// por quienes se suscriban por ese link, y el cobro sale del transaction_amount del plan. Sin el monto
// en la clave, dos ventas de la misma medida con precios distintos (descuento/override/reprice) pisaban
// el monto y cobraban a ambos el último → cobro por monto equivocado. Con el monto en la clave, cada
// precio = su plan. INVARIANTE: el plan del doc en la clave K SIEMPRE cobra el monto embebido en K.
// repricePlans (admin/pricing.ts) mantiene el invariante RE-KEYEANDO el doc al cambiarle el monto;
// getOrCreateAlignedPlan confía en la clave sin re-chequear el monto contra MP.
// PLAN POR BAULERA (decisión Lucas 30/07 — "nada de reutilizar"): la clave incluye el CÓDIGO de
// baulera → cada baulera tiene su PROPIO plan, con su código en el título. Antes el plan se
// compartía por (m2×monto×trial) y la suscripción HEREDA el título del plan → una venta a A3-050
// reusaba el plan de A3-046 y el cliente veía "Baulera A3-046". Con el código en la clave, A3-050
// crea su plan y jamás reusa el de otra baulera. (Sin código, cae a la clave vieja compartida —
// solo como fallback defensivo si una venta no trajera baulera.)
// PLAN POR VENTA (decisión Lucas 30/07 — "cada vez que se aprieta Vender debe generar un plan
// nuevo sí o sí"): la clave incluye además el ID DE LA VENTA → cada click de Vender/Reservar
// estrena su propio plan y su propio link, aunque sea la MISMA baulera al MISMO precio. Motivo de
// negocio: al cliente le decimos que el link vence en el día, así que un link viejo nunca se
// re-entrega; y como el plan es único de esa venta, el webhook puede casar la suscripción por el
// PLAN (= la baulera) sin depender del mail con el que el cliente termine pagando.
// Efecto colateral aceptado: mpPlans acumula un doc por venta (los de ventas que no se concretaron
// quedan huérfanos; no cobran nada por sí solos).
function codeKey(c?: string): string { return String(c || '').replace(/[^A-Za-z0-9]/g, '').toUpperCase(); }
export function planKey(p: { m2: number; amount: number; freeQty?: number; freeUnit?: FreeTrialUnit; bauleraCodigo?: string; ventaId?: string }): string {
  const q = Math.max(0, Number(p.freeQty) || 0);
  const unit: FreeTrialUnit = p.freeUnit === 'days' ? 'days' : 'months';
  const amt = Math.round(Number(p.amount));
  const base = q > 0 ? `m2-${String(p.m2)}-${amt}-trial${q}${unit === 'days' ? 'd' : 'm'}` : `m2-${String(p.m2)}-${amt}-alin1`;
  const ck = codeKey(p.bauleraCodigo);
  const vk = codeKey(p.ventaId);
  const conCodigo = ck ? `${base}-${ck}` : base; // con código = plan por baulera; sin código = clave vieja compartida
  return vk ? `${conCodigo}-${vk}` : conCodigo;  // con venta = plan por venta (nunca se reusa entre clicks)
}

export async function getOrCreateAlignedPlan(p: {
  m2: number; amount: number; freeQty?: number; freeUnit?: FreeTrialUnit; bauleraCodigo?: string; ventaId?: string;
}): Promise<MpPlanCreated> {
  const q = Math.max(0, Number(p.freeQty) || 0);
  const unit: FreeTrialUnit = p.freeUnit === 'days' ? 'days' : 'months';
  // Con ventaId la clave es única por click de Vender → el `snap.exists` de abajo solo pega si el
  // MISMO request se reintenta (idempotencia), nunca entre ventas distintas.
  const key = planKey({ m2: p.m2, amount: p.amount, freeQty: q, freeUnit: unit, bauleraCodigo: p.bauleraCodigo, ventaId: p.ventaId });
  const ref = db.collection('mpPlans').doc(key);
  const snap = await ref.get();

  if (snap.exists) {
    const doc = snap.data() as Record<string, unknown>;
    const planId = String(doc['planId']);
    const initPoint = String(doc['initPoint']);
    // El monto ya está fijado por la clave; solo puede faltar el upgrade de alineación (plan viejo).
    if (Number(doc['billingDay']) !== 1) {
      await updatePlanBilling(planId, p.amount, 1, true); // proporcional SIEMPRE (31/07: MP cobra la entrada, ya no hay link 2)
      await ref.set({ billingDay: 1, updatedAt: new Date().toISOString() }, { merge: true });
    }
    return { planId, initPoint };
  }

  const created = await createPlan({ m2: p.m2, amount: p.amount, freeTrialQty: q, freeTrialUnit: unit, billingDay: 1, bauleraCodigo: p.bauleraCodigo });
  await ref.set({
    m2: p.m2, amount: p.amount,
    freeTrialQty: q > 0 ? q : null, freeTrialUnit: q > 0 ? unit : null,
    bauleraCodigo: p.bauleraCodigo || null, // guardado para que repricePlans reconstruya la clave con el código
    ventaId: p.ventaId || null,             // idem: sin esto el re-key perdería el aislamiento por venta
    billingDay: 1,
    planId: created.planId, initPoint: created.initPoint,
    createdAt: new Date().toISOString(),
  });
  return created;
}
