import { db } from '../config/firebase';

// Precios base por medida (m2). Fuente de verdad server-side.
// Default = precios actuales de la web (Nordelta) hasta que el admin los cambie.
export const DEFAULT_BY_M2: Record<string, number> = {
  '1.5': 53550, '2': 71400, '3': 88200,
  '5.1': 139230, '6': 151200, '8': 204120, '9': 207900,
  '11.25': 259875, '13.5': 283500, '15': 441000,
};

const PRICING_COLLECTION = 'pricing';

function normM2(m2: number | string): string {
  return String(Number(m2)); // "3", "5.1", "15"
}

export async function getPricingByM2(branchId = 'nordelta'): Promise<Record<string, number>> {
  try {
    const doc = await db.collection(PRICING_COLLECTION).doc(branchId).get();
    const cfg = (doc.exists ? (doc.data() as Record<string, unknown>) : {}) || {};
    const byM2 = (cfg.byM2 && typeof cfg.byM2 === 'object') ? (cfg.byM2 as Record<string, unknown>) : {};
    const merged: Record<string, number> = { ...DEFAULT_BY_M2 };
    for (const k of Object.keys(byM2)) {
      const v = Number(byM2[k]);
      if (Number.isFinite(v) && v > 0) merged[normM2(k)] = v;
    }
    // Cambios PROGRAMADOS: se aplican los que ya llegaron a su fecha (effectiveDate <= hoy)
    const today = new Date().toISOString().slice(0, 10);
    const scheduled = Array.isArray((cfg as Record<string, unknown>).scheduled)
      ? ((cfg as Record<string, unknown>).scheduled as Array<{ effectiveDate?: string; byM2?: Record<string, unknown> }>) : [];
    scheduled
      .filter((s) => s && s.effectiveDate && String(s.effectiveDate) <= today && s.byM2)
      .sort((a, b) => String(a.effectiveDate).localeCompare(String(b.effectiveDate)))
      .forEach((s) => {
        for (const k of Object.keys(s.byM2 as Record<string, unknown>)) {
          const v = Number((s.byM2 as Record<string, unknown>)[k]);
          if (Number.isFinite(v) && v > 0) merged[normM2(k)] = v;
        }
      });
    return merged;
  } catch {
    return { ...DEFAULT_BY_M2 };
  }
}

export function priceForM2(byM2: Record<string, number>, m2: number | string): number | null {
  const v = byM2[normM2(m2)];
  return (typeof v === 'number' && v > 0) ? v : null;
}

// Recurrente mensual segun medida y duracion (20% off anual a 12+ meses)
export function recurringFor(byM2: Record<string, number>, m2: number | string, duration: number): number | null {
  const base = priceForM2(byM2, m2);
  if (base == null) return null;
  const annual = Number(duration) >= 12 ? 0.8 : 1;
  return Math.round(base * annual);
}
