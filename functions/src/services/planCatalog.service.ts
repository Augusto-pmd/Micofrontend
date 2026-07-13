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
export async function getOrCreateAlignedPlan(p: {
  m2: number; amount: number; freeQty?: number; freeUnit?: FreeTrialUnit;
}): Promise<MpPlanCreated> {
  const q = Math.max(0, Number(p.freeQty) || 0);
  const unit: FreeTrialUnit = p.freeUnit === 'days' ? 'days' : 'months';
  const key = q > 0 ? `m2-${String(p.m2)}-trial${q}${unit === 'days' ? 'd' : 'm'}` : `m2-${String(p.m2)}-alin1`;
  const ref = db.collection('mpPlans').doc(key);
  const snap = await ref.get();

  if (snap.exists) {
    const doc = snap.data() as Record<string, unknown>;
    const planId = String(doc['planId']);
    const initPoint = String(doc['initPoint']);
    const needAmount = Number(doc['amount']) !== p.amount;
    const needBilling = Number(doc['billingDay']) !== 1; // plan viejo sin alinear → upgrade
    if (needAmount || needBilling) {
      await updatePlanBilling(planId, p.amount, 1);
      await ref.set({ amount: p.amount, billingDay: 1, updatedAt: new Date().toISOString() }, { merge: true });
    }
    return { planId, initPoint };
  }

  const created = await createPlan({ m2: p.m2, amount: p.amount, freeTrialQty: q, freeTrialUnit: unit, billingDay: 1 });
  await ref.set({
    m2: p.m2, amount: p.amount,
    freeTrialQty: q > 0 ? q : null, freeTrialUnit: q > 0 ? unit : null,
    billingDay: 1,
    planId: created.planId, initPoint: created.initPoint,
    createdAt: new Date().toISOString(),
  });
  return created;
}
